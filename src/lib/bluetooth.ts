import { BLUETOOTH_GATT_CONNECTION_TIMEOUT_MS } from '../constants';
import type { Metrics, Range } from '../types';
import { bluetoothGattCoordinator } from './bluetooth-gatt-coordinator';
import { loadRememberedBluetoothDevices } from './remembered-bluetooth-devices';
import { MAX_RESISTANCE } from './resistance';
import { kilometersForMeters, SECONDS_PER_MINUTE } from './units';

export const TRAINER_DEVICE_STORAGE_KEY = 'trainer-device-id';

export interface CrankReading {
	revolutions: number;
	time: number;
}

interface GattConnectionTiming {
	directTimeoutMs: number;
	reconnectProbeTimeoutMs: number;
}

const ADVERTISEMENT_DISCOVERY_WARMUP_MS = 250;
const DEFAULT_GATT_CONNECTION_TIMING: GattConnectionTiming = {
	directTimeoutMs: BLUETOOTH_GATT_CONNECTION_TIMEOUT_MS,
	reconnectProbeTimeoutMs: BLUETOOTH_GATT_CONNECTION_TIMEOUT_MS,
};

export function isBluetoothChooserCancellation(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'NotFoundError';
}

export function characteristicValue(event: Event): DataView | undefined {
	return (event.target as BluetoothRemoteGATTCharacteristic).value;
}

export function recordPedaling(
	lastPedalingAt: { current: number },
	active: boolean,
	now = performance.now()
) {
	if (active) {
		lastPedalingAt.current = now;
	}
}

export function recordMetricActivity(
	lastPedalingAt: { current: number },
	metrics: Partial<Metrics>,
	now = performance.now()
) {
	recordPedaling(lastPedalingAt, (metrics.cadence ?? 0) > 1 || (metrics.power ?? 0) > 5, now);
}

export function parseIndoorBikeData(value: DataView): {
	metrics: Partial<Metrics>;
	reportsDistance: boolean;
} {
	const flags = value.getUint16(0, true);
	let offset = 2;
	const metrics: Partial<Metrics> = {};
	if (!(flags & 1)) {
		metrics.speed = value.getUint16(offset, true) / 100;
		offset += 2;
	}
	if (flags & (1 << 1)) {
		offset += 2;
	}
	if (flags & (1 << 2)) {
		metrics.cadence = value.getUint16(offset, true) / 2;
		offset += 2;
	}
	if (flags & (1 << 3)) {
		offset += 2;
	}
	let reportsDistance = false;
	if (flags & (1 << 4)) {
		reportsDistance = true;
		metrics.distance = kilometersForMeters(
			value.getUint8(offset) |
				(value.getUint8(offset + 1) << 8) |
				(value.getUint8(offset + 2) << 16)
		);
		offset += 3;
	}
	if (flags & (1 << 5)) {
		offset += 2;
	}
	if (flags & (1 << 6)) {
		metrics.power = value.getInt16(offset, true);
		offset += 2;
	}
	if (flags & (1 << 7)) {
		offset += 2;
	}
	if (flags & (1 << 8)) {
		metrics.calories = value.getUint16(offset, true);
		offset += 5;
	}
	if (flags & (1 << 9)) {
		metrics.heartRate = value.getUint8(offset);
	}
	return { metrics, reportsDistance };
}

export function parseCrankCadence(
	value: DataView,
	previous?: CrankReading
): { cadence?: number; current?: CrankReading } {
	let offset = 1;
	if (value.getUint8(0) & 1) {
		offset += 6;
	}
	if (!(value.getUint8(0) & 2)) {
		return {};
	}
	const current = {
		revolutions: value.getUint16(offset, true),
		time: value.getUint16(offset + 2, true),
	};
	if (!previous) {
		return { current };
	}
	const deltaTime = (current.time - previous.time + 65_536) % 65_536;
	const deltaRevs = (current.revolutions - previous.revolutions + 65_536) % 65_536;
	return {
		cadence: deltaTime ? (deltaRevs * SECONDS_PER_MINUTE * 1024) / deltaTime : undefined,
		current,
	};
}

export function resistanceCommand(percent: number, range: Range): number[] {
	const trainerLevel = range.min + (percent / MAX_RESISTANCE) * (range.max - range.min);
	const scaled = Math.round(trainerLevel * 10);
	return [0x04, scaled & 255, (scaled >> 8) & 255];
}

export async function findRememberedTrainer(
	bluetooth: Bluetooth = navigator.bluetooth,
	storage: Pick<Storage, 'getItem'> = localStorage
): Promise<BluetoothDevice | undefined> {
	const permitted = await loadRememberedBluetoothDevices(bluetooth);
	return selectRememberedTrainer(permitted, storage);
}

export function selectRememberedTrainer(
	permitted: readonly BluetoothDevice[],
	storage: Pick<Storage, 'getItem'> = localStorage
): BluetoothDevice | undefined {
	const savedDeviceId = storage.getItem(TRAINER_DEVICE_STORAGE_KEY);
	return (
		permitted.find((candidate) => candidate.id === savedDeviceId) ??
		// Preserve automatic reconnect for people paired before trainer ids were stored.
		permitted.find((candidate) => candidate.name?.toUpperCase().startsWith('KICKR'))
	);
}

export interface BluetoothAdvertisementWatch {
	ready: Promise<void>;
	stop: () => void;
	supported: boolean;
}

function boundedAdvertisementWarmup(started: Promise<void>): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const warmup = new Promise<void>((resolve) => {
		timeout = setTimeout(resolve, ADVERTISEMENT_DISCOVERY_WARMUP_MS);
	});
	return Promise.race([started, warmup]).finally(() => clearTimeout(timeout));
}

export function watchBluetoothAdvertisements(
	device: BluetoothDevice,
	onAdvertisement: (event: BluetoothAdvertisingEvent) => void,
	onUnavailable?: () => void
): BluetoothAdvertisementWatch {
	if (!device.watchAdvertisements) {
		onUnavailable?.();
		return { ready: Promise.resolve(), stop: () => undefined, supported: false };
	}
	const abortController = new AbortController();
	let active = true;
	const handleAdvertisement = (event: Event) =>
		onAdvertisement(event as BluetoothAdvertisingEvent);
	const startedWatch = !device.watchingAdvertisements;
	const stop = () => {
		if (!active) {
			return;
		}
		active = false;
		device.removeEventListener('advertisementreceived', handleAdvertisement);
		if (startedWatch) {
			abortController.abort();
		}
	};
	device.addEventListener('advertisementreceived', handleAdvertisement);
	let ready = Promise.resolve();
	if (startedWatch) {
		try {
			const started = device
				.watchAdvertisements({ signal: abortController.signal })
				.catch(() => {
					stop();
					onUnavailable?.();
				});
			ready = boundedAdvertisementWarmup(started);
		} catch {
			stop();
			onUnavailable?.();
			return { ready, stop, supported: false };
		}
	}
	return { ready, stop, supported: true };
}

export function connectGatt(
	device: BluetoothDevice,
	rediscover: boolean,
	timing: GattConnectionTiming = DEFAULT_GATT_CONNECTION_TIMING
): Promise<BluetoothRemoteGATTServer> {
	return bluetoothGattCoordinator.connect(
		device,
		rediscover ? timing.reconnectProbeTimeoutMs : timing.directTimeoutMs,
		'Bluetooth device connection timed out.'
	);
}
