import { describe, expect, test } from 'bun:test';
import { createBluetoothGattCoordinator } from '../src/lib/bluetooth-gatt-coordinator';

function bluetoothDevice(
	id: string,
	connect: () => Promise<BluetoothRemoteGATTServer>,
	onDisconnect: () => void = () => undefined
): BluetoothDevice {
	return {
		gatt: {
			connect,
			connected: false,
			disconnect: onDisconnect,
		},
		id,
	} as unknown as BluetoothDevice;
}

describe('Bluetooth GATT coordinator', () => {
	test('establishes different device connections in parallel', async () => {
		const coordinator = createBluetoothGattCoordinator();
		const operations: string[] = [];
		let finishFirst: (() => void) | undefined;
		const firstServer = {} as BluetoothRemoteGATTServer;
		const secondServer = {} as BluetoothRemoteGATTServer;
		const first = bluetoothDevice(
			'trainer',
			() =>
				new Promise((resolve) => {
					operations.push('trainer');
					finishFirst = () => resolve(firstServer);
				})
		);
		const second = bluetoothDevice('heart-rate', () => {
			operations.push('heart-rate');
			return Promise.resolve(secondServer);
		});

		const firstConnection = coordinator.connect(first, 1000, 'trainer timeout');
		const secondConnection = coordinator.connect(second, 1000, 'heart-rate timeout');
		await Promise.resolve();
		expect(operations).toEqual(['trainer', 'heart-rate']);

		finishFirst?.();
		expect(await firstConnection).toBe(firstServer);
		expect(await secondConnection).toBe(secondServer);
	});

	test('deduplicates simultaneous requests for the same device', async () => {
		const coordinator = createBluetoothGattCoordinator();
		let attempts = 0;
		const server = {} as BluetoothRemoteGATTServer;
		const device = bluetoothDevice('click-plus', () => {
			attempts += 1;
			return Promise.resolve(server);
		});

		const first = coordinator.connect(device, 1000, 'timeout');
		const duplicate = coordinator.connect(device, 1000, 'timeout');
		expect(first).toBe(duplicate);
		expect(await duplicate).toBe(server);
		expect(attempts).toBe(1);
	});

	test('disconnects a failed device without blocking another handshake', async () => {
		const coordinator = createBluetoothGattCoordinator();
		const operations: string[] = [];
		const failed = bluetoothDevice(
			'click-minus',
			() => {
				operations.push('connect-click-minus');
				return Promise.reject(new Error('unavailable'));
			},
			() => operations.push('disconnect-click-minus')
		);
		const server = {} as BluetoothRemoteGATTServer;
		const ready = bluetoothDevice('trainer', () => {
			operations.push('connect-trainer');
			return Promise.resolve(server);
		});

		const failedConnection = coordinator.connect(failed, 1000, 'timeout');
		const readyConnection = coordinator.connect(ready, 1000, 'timeout');
		expect(await readyConnection).toBe(server);
		await expect(failedConnection).rejects.toThrow('unavailable');
		expect(operations).toContain('disconnect-click-minus');
		expect(operations.slice(0, 2)).toEqual(['connect-click-minus', 'connect-trainer']);
	});
});
