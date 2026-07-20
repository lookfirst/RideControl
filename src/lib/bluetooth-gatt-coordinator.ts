import { withPromiseTimeout } from './promise-timeout';

export interface BluetoothGattCoordinator {
	connect: (
		device: BluetoothDevice,
		timeoutMs: number,
		timeoutMessage: string
	) => Promise<BluetoothRemoteGATTServer>;
}

export function createBluetoothGattCoordinator(): BluetoothGattCoordinator {
	const pending = new Map<string, Promise<BluetoothRemoteGATTServer>>();

	return {
		connect: (device, timeoutMs, timeoutMessage) => {
			const existing = pending.get(device.id);
			if (existing) {
				return existing;
			}
			const connect = async () => {
				const { gatt } = device;
				if (!gatt) {
					throw new Error('This device does not expose a GATT server.');
				}
				if (gatt.connected) {
					return gatt;
				}
				try {
					return await withPromiseTimeout(
						gatt.connect(),
						timeoutMs,
						() => new Error(timeoutMessage)
					);
				} catch (error) {
					gatt.disconnect();
					throw error;
				}
			};
			// Chrome can establish independent devices concurrently. Only collapse duplicate
			// requests for the same physical device so one slow sensor never blocks another.
			const connection = connect();
			pending.set(device.id, connection);
			const clearPending = () => {
				if (pending.get(device.id) === connection) {
					pending.delete(device.id);
				}
			};
			connection.then(clearPending, clearPending);
			return connection;
		},
	};
}

export const bluetoothGattCoordinator = createBluetoothGattCoordinator();
