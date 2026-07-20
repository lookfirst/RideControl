import { type BluetoothAdvertisementWatch, watchBluetoothAdvertisements } from './bluetooth';
import {
	createReconnectController,
	type ReconnectController,
	type ReconnectControllerOptions,
} from './reconnect-controller';

const FIRST_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 2000;
const IMMEDIATE_RECONNECT_DELAY_MS = 1;

interface BluetoothReconnectControllerOptions<T extends BluetoothDevice>
	extends Omit<ReconnectControllerOptions<T>, 'delayForAttempt'> {
	onAdvertisement?: (target: T, event: BluetoothAdvertisingEvent) => void;
	watchAdvertisements?: boolean;
}

export function bluetoothReconnectDelay(attempt: number): number {
	return Math.min(MAX_RECONNECT_DELAY_MS, FIRST_RECONNECT_DELAY_MS * 2 ** (attempt - 1));
}

export function createBluetoothReconnectController<T extends BluetoothDevice>({
	onAdvertisement,
	watchAdvertisements = true,
	...options
}: BluetoothReconnectControllerOptions<T>): ReconnectController<T> {
	const advertisementWatches = new Map<string, BluetoothAdvertisementWatch>();
	const stopWatching = (key: string) => {
		advertisementWatches.get(key)?.stop();
		advertisementWatches.delete(key);
	};
	let controller: ReconnectController<T>;
	const ensureWatching = (key: string, target: T) => {
		if (!watchAdvertisements) {
			return;
		}
		const existing = advertisementWatches.get(key);
		if (existing) {
			return existing;
		}
		let activeWatch: BluetoothAdvertisementWatch | undefined;
		const watch = watchBluetoothAdvertisements(
			target,
			(event) => {
				onAdvertisement?.(target, event);
				controller.expedite(key, target, IMMEDIATE_RECONNECT_DELAY_MS);
			},
			() => {
				if (advertisementWatches.get(key) === activeWatch) {
					advertisementWatches.delete(key);
				}
			}
		);
		if (!watch.supported) {
			return;
		}
		activeWatch = watch;
		advertisementWatches.set(key, watch);
		return watch;
	};
	const reconnectController = createReconnectController({
		...options,
		attempt: async (target) => {
			await ensureWatching(target.id, target)?.ready;
			const connected = await options.attempt(target);
			if (connected) {
				stopWatching(target.id);
			} else {
				ensureWatching(target.id, target);
			}
			return connected;
		},
		delayForAttempt: bluetoothReconnectDelay,
	});
	controller = {
		...reconnectController,
		cancel: (key, resetAttempts) => {
			if (resetAttempts) {
				stopWatching(key);
			}
			reconnectController.cancel(key, resetAttempts);
		},
		cancelAll: () => {
			for (const key of advertisementWatches.keys()) {
				stopWatching(key);
			}
			reconnectController.cancelAll();
		},
		expedite: (key, target, delay) => {
			ensureWatching(key, target);
			reconnectController.expedite(key, target, delay);
		},
		reset: (key) => {
			stopWatching(key);
			reconnectController.reset(key);
		},
		start: (key, target, initialDelay) => {
			ensureWatching(key, target);
			reconnectController.start(key, target, initialDelay);
		},
	};
	return controller;
}

export function reconnectBluetoothDeviceNow(
	controller: ReconnectController<BluetoothDevice>,
	device: BluetoothDevice
) {
	controller.expedite(device.id, device, IMMEDIATE_RECONNECT_DELAY_MS);
}

export function reconnectBluetoothDevicesNow(
	controller: ReconnectController<BluetoothDevice>,
	devices: readonly BluetoothDevice[]
) {
	for (const device of devices) {
		reconnectBluetoothDeviceNow(controller, device);
	}
}

export function scheduleBluetoothDeviceReconnect(
	controller: ReconnectController<BluetoothDevice>,
	device: BluetoothDevice
) {
	controller.start(device.id, device);
}

export function scheduleBluetoothDeviceReconnects(
	controller: ReconnectController<BluetoothDevice>,
	devices: readonly BluetoothDevice[]
) {
	for (const device of devices) {
		scheduleBluetoothDeviceReconnect(controller, device);
	}
}
