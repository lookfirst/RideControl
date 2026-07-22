import { describe, expect, test } from 'bun:test';
import {
	characteristicValue,
	connectGatt,
	findRememberedTrainer,
	parseCrankCadence,
	parseIndoorBikeData,
	recordMetricActivity,
	recordPedaling,
	resistanceCommand,
} from '../src/lib/bluetooth';
import {
	loadRememberedBluetoothDevices,
	rememberedBluetoothDevice,
	rememberedBluetoothDevices,
} from '../src/lib/remembered-bluetooth-devices';

describe('Bluetooth data utilities', () => {
	test('tracks meaningful pedaling activity', () => {
		const last = { current: 2 };
		recordPedaling(last, false, 10);
		expect(last.current).toBe(2);
		recordMetricActivity(last, { cadence: 2 }, 20);
		expect(last.current).toBe(20);
		recordMetricActivity(last, { power: 6 }, 30);
		expect(last.current).toBe(30);
		recordMetricActivity(last, { cadence: 1, power: 5 }, 40);
		expect(last.current).toBe(30);
	});

	test('reads the value from a characteristic event', () => {
		const value = new DataView(new ArrayBuffer(2));
		expect(characteristicValue({ target: { value } } as unknown as Event)).toBe(value);
	});

	test('parses an FTMS indoor bike packet', () => {
		const buffer = new ArrayBuffer(17);
		const view = new DataView(buffer);
		view.setUint16(0, 0x3_54, true);
		view.setUint16(2, 3250, true);
		view.setUint16(4, 180, true);
		view.setUint8(6, 0x39);
		view.setUint8(7, 0x30);
		view.setUint8(8, 0);
		view.setInt16(9, 245, true);
		view.setUint16(11, 321, true);
		view.setUint16(13, 0, true);
		view.setUint8(15, 0);
		view.setUint8(16, 154);

		expect(parseIndoorBikeData(view)).toEqual({
			metrics: {
				cadence: 90,
				calories: 321,
				distance: 12.345,
				heartRate: 154,
				power: 245,
				speed: 32.5,
			},
			reportsDistance: true,
		});
	});

	test('parses CSC cadence and the first baseline packet', () => {
		const buffer = new ArrayBuffer(5);
		const view = new DataView(buffer);
		view.setUint8(0, 2);
		view.setUint16(1, 12, true);
		view.setUint16(3, 2024, true);
		expect(parseCrankCadence(view)).toEqual({
			current: { revolutions: 12, time: 2024 },
		});
		expect(parseCrankCadence(view, { revolutions: 10, time: 1000 })).toEqual({
			cadence: 120,
			current: { revolutions: 12, time: 2024 },
		});
		view.setUint8(0, 0);
		expect(parseCrankCadence(view)).toEqual({});
	});

	test('encodes resistance using the trainer range', () => {
		expect(resistanceCommand(50, { max: 30, min: -10 })).toEqual([4, 100, 0]);
	});

	test('prefers a saved trainer and preserves the legacy KICKR fallback', async () => {
		const devices = [
			{ id: 'one', name: 'Other' },
			{ id: 'two', name: 'KICKR CORE' },
		] as BluetoothDevice[];
		const bluetooth = {
			getDevices: async () => devices,
		} as Bluetooth;
		expect(await findRememberedTrainer(bluetooth, { getItem: () => 'one' })).toBe(devices[0]);
		expect(await findRememberedTrainer(bluetooth, { getItem: () => null })).toBe(devices[1]);
		expect(
			await findRememberedTrainer({ getDevices: async () => [devices[0]] } as Bluetooth, {
				getItem: () => null,
			})
		).toBeUndefined();
		expect(
			await findRememberedTrainer({} as Bluetooth, { getItem: () => null })
		).toBeUndefined();
	});

	test('loads and selects all saved device types from one permitted-device catalog', async () => {
		const permitted = [
			{ id: 'trainer' },
			{ id: 'heart-rate' },
			{ id: 'click-minus' },
			{ id: 'click-plus' },
		] as BluetoothDevice[];
		let loads = 0;
		const devices = await loadRememberedBluetoothDevices({
			getDevices: () => {
				loads += 1;
				return Promise.resolve(permitted);
			},
		} as Bluetooth);

		expect(loads).toBe(1);
		expect(rememberedBluetoothDevice(devices, 'heart-rate')).toBe(permitted[1]);
		expect(
			rememberedBluetoothDevices(devices, ['click-plus', 'missing', 'click-minus'], 2)
		).toEqual([permitted[3], permitted[2]]);
	});

	test('connects GATT', async () => {
		const server = {} as BluetoothRemoteGATTServer;
		const device = {
			gatt: { connect: async () => server },
		} as unknown as BluetoothDevice;
		expect(await connectGatt(device, false)).toBe(server);
	});

	test('uses one bounded GATT probe per reconnect cycle', async () => {
		let attempts = 0;
		const device = {
			gatt: {
				connect: () => {
					attempts += 1;
					return Promise.reject(new Error('temporarily unavailable'));
				},
				disconnect: () => undefined,
			},
		} as unknown as BluetoothDevice;

		await expect(connectGatt(device, true)).rejects.toThrow('temporarily unavailable');
		expect(attempts).toBe(1);
	});

	test('times out stalled GATT reconnects so background retries can continue', async () => {
		let attempts = 0;
		const device = {
			gatt: {
				connect: () => {
					attempts += 1;
					return new Promise(() => undefined);
				},
				disconnect: () => undefined,
			},
		} as unknown as BluetoothDevice;
		await expect(
			connectGatt(device, true, {
				directTimeoutMs: 1,
				reconnectProbeTimeoutMs: 1,
			})
		).rejects.toThrow('Bluetooth device connection timed out.');
		expect(attempts).toBe(1);
	});

	test('rejects devices without a GATT server', async () => {
		await expect(connectGatt({} as BluetoothDevice, false)).rejects.toThrow(
			'does not expose a GATT server'
		);
	});
});
