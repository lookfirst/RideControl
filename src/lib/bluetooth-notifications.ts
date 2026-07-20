import { BLUETOOTH_OPERATION_TIMEOUT_MS } from '../constants';
import { withBluetoothOperationTimeout } from './bluetooth-operation';

export type BluetoothNotificationCleanup = () => void;

export interface BluetoothNotificationSubscription {
	cleanup: BluetoothNotificationCleanup;
	start: () => Promise<void>;
}

export function createBluetoothNotificationSubscription(
	characteristic: BluetoothRemoteGATTCharacteristic,
	listener: (event: Event) => void
): BluetoothNotificationSubscription {
	characteristic.addEventListener('characteristicvaluechanged', listener);
	return {
		cleanup: () => characteristic.removeEventListener('characteristicvaluechanged', listener),
		start: async () => {
			await characteristic.startNotifications();
		},
	};
}

export async function startBluetoothNotifications(
	characteristic: BluetoothRemoteGATTCharacteristic,
	listener: (event: Event) => void,
	timeoutMs = BLUETOOTH_OPERATION_TIMEOUT_MS
): Promise<BluetoothNotificationCleanup> {
	const subscription = createBluetoothNotificationSubscription(characteristic, listener);
	try {
		await withBluetoothOperationTimeout(
			subscription.start(),
			'Bluetooth notification setup',
			timeoutMs
		);
	} catch (error) {
		subscription.cleanup();
		throw error;
	}
	return subscription.cleanup;
}

export function combineBluetoothCleanups(
	...cleanups: Array<BluetoothNotificationCleanup | undefined>
): BluetoothNotificationCleanup {
	return () => {
		for (const cleanup of cleanups) {
			cleanup?.();
		}
	};
}
