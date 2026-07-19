import type { Metrics, Range } from '../types';

export interface CrankReading {
	revolutions: number;
	time: number;
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
		metrics.distance =
			(value.getUint8(offset) |
				(value.getUint8(offset + 1) << 8) |
				(value.getUint8(offset + 2) << 16)) /
			1000;
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
		cadence: deltaTime ? (deltaRevs * 60 * 1024) / deltaTime : undefined,
		current,
	};
}

export function resistanceCommand(percent: number, range: Range): number[] {
	const trainerLevel = range.min + (percent / 100) * (range.max - range.min);
	const scaled = Math.round(trainerLevel * 10);
	return [0x04, scaled & 255, (scaled >> 8) & 255];
}

export async function findRememberedKickr(
	bluetooth: Bluetooth = navigator.bluetooth,
	storage: Pick<Storage, 'getItem'> = localStorage
): Promise<BluetoothDevice | undefined> {
	if (!bluetooth?.getDevices) {
		return;
	}
	const permitted = await bluetooth.getDevices();
	const savedDeviceId = storage.getItem('trainer-device-id');
	return (
		permitted.find((candidate) => candidate.id === savedDeviceId) ??
		permitted.find((candidate) => candidate.name?.toUpperCase().startsWith('KICKR')) ??
		(permitted.length === 1 ? permitted[0] : undefined)
	);
}

export async function waitForFreshAdvertisement(
	device: BluetoothDevice,
	onAdvertisement?: (event: BluetoothAdvertisingEvent) => void,
	timeoutMs = 3000
): Promise<void> {
	if (typeof device.watchAdvertisements !== 'function') {
		return;
	}
	const controller = new AbortController();
	await new Promise<void>((resolve) => {
		let finished = false;
		let timeout: number | undefined;
		const finish = () => {
			if (finished) {
				return;
			}
			finished = true;
			window.clearTimeout(timeout);
			device.removeEventListener('advertisementreceived', handleAdvertisement);
			controller.abort();
			resolve();
		};
		const handleAdvertisement = (event: Event) => {
			try {
				onAdvertisement?.(event as BluetoothAdvertisingEvent);
			} finally {
				finish();
			}
		};
		device.addEventListener('advertisementreceived', handleAdvertisement, { once: true });
		timeout = window.setTimeout(finish, timeoutMs);
		device.watchAdvertisements({ signal: controller.signal }).catch(finish);
	});
}

export async function connectGatt(
	device: BluetoothDevice,
	rediscover: boolean,
	updateStatus: (status: string) => void
): Promise<BluetoothRemoteGATTServer> {
	if (!device.gatt) {
		throw new Error('This device does not expose a GATT server.');
	}
	updateStatus('Connecting…');
	try {
		return await device.gatt.connect();
	} catch (directConnectionError) {
		if (!rediscover) {
			throw directConnectionError;
		}
		updateStatus('Finding trainer…');
		await waitForFreshAdvertisement(device);
		updateStatus('Connecting…');
		return await device.gatt.connect();
	}
}
