import { describe, expect, test } from 'bun:test';
import { HEART_RATE } from '../src/constants';
import { parseHeartRateMeasurement } from '../src/lib/heart-rate';
import { connectHeartRateDevice } from '../src/lib/heart-rate-device';
import {
	clickControllerRoleFromManufacturerData,
	clickV2StartCommand,
	connectClickGatt,
	filterAcceptedClickShifts,
	filterClickShiftsForController,
	parseClickV2Shift,
	registerClickControllerRole,
	shouldAcceptClickShift,
	storedClickControllerRoles,
	storedClickDeviceIds,
	waitForUsableClickNotification,
	withClickConnectionTimeout,
} from '../src/lib/zwift-click';

function view(bytes: number[]) {
	return new DataView(new Uint8Array(bytes).buffer);
}

function uint32Varint(value: number) {
	const bytes: number[] = [];
	let remaining = value >>> 0;
	while (remaining > 0x7f) {
		bytes.push((remaining & 0x7f) | 0x80);
		remaining >>>= 7;
	}
	bytes.push(remaining);
	return bytes;
}

function clickMessage(buttonMap: number) {
	return view([0x23, 0x08, ...uint32Varint(buttonMap)]);
}

describe('paired device protocols', () => {
	test('parses 8-bit and 16-bit heart rate measurements', () => {
		expect(parseHeartRateMeasurement(view([0, 142]))).toBe(142);
		expect(parseHeartRateMeasurement(view([1, 44, 1]))).toBe(300);
		expect(parseHeartRateMeasurement(view([1, 44]))).toBeUndefined();
	});

	test('retries a remembered heart rate monitor in separate bounded cycles', async () => {
		let attempts = 0;
		let notificationsStarted = 0;
		const measurement = {
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			startNotifications: () => {
				notificationsStarted += 1;
				return Promise.resolve(measurement);
			},
		} as unknown as BluetoothRemoteGATTCharacteristic;
		const server = {
			getPrimaryService: (service: BluetoothServiceUUID) => {
				if (service !== HEART_RATE) {
					return Promise.reject(new Error('Battery unavailable'));
				}
				return Promise.resolve({
					getCharacteristic: () => Promise.resolve(measurement),
				} as unknown as BluetoothRemoteGATTService);
			},
		} as BluetoothRemoteGATTServer;
		const device = {
			addEventListener: () => undefined,
			gatt: {
				connect: () => {
					attempts += 1;
					return attempts === 1
						? Promise.reject(new Error('stale browser connection'))
						: Promise.resolve(server);
				},
				disconnect: () => undefined,
			},
			removeEventListener: () => undefined,
		} as unknown as BluetoothDevice;
		const callbacks = {
			onBattery: () => undefined,
			onDisconnect: () => undefined,
			onHeartRate: () => undefined,
		};
		await expect(connectHeartRateDevice(device, true, callbacks)).rejects.toThrow(
			'stale browser connection'
		);
		const connection = await connectHeartRateDevice(device, true, callbacks);
		expect(attempts).toBe(2);
		expect(notificationsStarted).toBe(1);
		connection.cleanup();
	});

	test('releases a stalled heart rate notification attempt so it can be retried', async () => {
		const listeners = new Set<EventListenerOrEventListenerObject>();
		let notificationAttempts = 0;
		const measurement = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.add(listener),
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.delete(listener),
			startNotifications: () => {
				notificationAttempts += 1;
				return notificationAttempts === 1
					? new Promise(() => undefined)
					: Promise.resolve(measurement);
			},
		} as unknown as BluetoothRemoteGATTCharacteristic;
		const server = {
			getPrimaryService: () =>
				Promise.resolve({
					getCharacteristic: () => Promise.resolve(measurement),
				} as unknown as BluetoothRemoteGATTService),
		} as unknown as BluetoothRemoteGATTServer;
		const device = {
			addEventListener: () => undefined,
			gatt: { connect: () => Promise.resolve(server) },
			removeEventListener: () => undefined,
		} as unknown as BluetoothDevice;
		const callbacks = {
			onBattery: () => undefined,
			onDisconnect: () => undefined,
			onHeartRate: () => undefined,
		};

		await expect(connectHeartRateDevice(device, false, callbacks, 1)).rejects.toThrow(
			'Bluetooth notification setup timed out.'
		);
		expect(listeners.size).toBe(0);

		const connection = await connectHeartRateDevice(device, false, callbacks, 100);
		expect(notificationAttempts).toBe(2);
		expect(listeners.size).toBe(1);
		connection.cleanup();
		expect(listeners.size).toBe(0);
	});

	test('starts a Click V2 session with its RideOn command', () => {
		expect([...new Uint8Array(clickV2StartCommand())]).toEqual([
			0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 0x02, 0x03,
		]);
	});

	test('identifies Click V2 controller sides from their advertisements', () => {
		expect(clickControllerRoleFromManufacturerData(new Map([[2378, view([0x0a])]]))).toBe('up');
		expect(clickControllerRoleFromManufacturerData(new Map([[2378, view([0x0b])]]))).toBe(
			'down'
		);
		expect(
			clickControllerRoleFromManufacturerData(new Map([[2378, view([0x09])]]))
		).toBeUndefined();
		expect(clickControllerRoleFromManufacturerData(new Map())).toBeUndefined();
	});

	test('routes mirrored Click events only through the matching controller side', () => {
		expect(filterClickShiftsForController(['down', 'up'], 'up')).toEqual(['up']);
		expect(filterClickShiftsForController(['down', 'up'], 'down')).toEqual(['down']);
		expect(filterClickShiftsForController(['down', 'up'], undefined)).toEqual(['down', 'up']);
	});

	test('times out an unresponsive Click connection so it can be retried', async () => {
		await expect(withClickConnectionTimeout(new Promise(() => undefined), 1)).rejects.toThrow(
			'Controller did not respond. Wake it and try again.'
		);
		expect(await withClickConnectionTimeout(Promise.resolve('connected'), 100)).toBe(
			'connected'
		);
	});

	test('accepts either Click notification channel or observed controller data', async () => {
		const unavailable = () => [
			Promise.reject(new Error('async unavailable')),
			Promise.reject(new Error('sync unavailable')),
		];
		await expect(
			waitForUsableClickNotification(unavailable(), () => false)
		).rejects.toBeInstanceOf(AggregateError);
		expect(await waitForUsableClickNotification(unavailable(), () => true)).toBeUndefined();
		expect(
			await waitForUsableClickNotification(
				[Promise.reject(new Error('async unavailable')), Promise.resolve()],
				() => false
			)
		).toBeUndefined();
	});

	test('connects an awake Click immediately and retries failures in separate cycles', async () => {
		const server = {} as BluetoothRemoteGATTServer;
		const awakeDevice = {
			gatt: {
				connect: () => Promise.resolve(server),
			},
		} as unknown as BluetoothDevice;
		expect(await connectClickGatt(awakeDevice, true)).toBe(server);

		let attempts = 0;
		const sleepingDevice = {
			gatt: {
				connect: () => {
					attempts += 1;
					return attempts === 1
						? Promise.reject(new Error('temporarily unavailable'))
						: Promise.resolve(server);
				},
				disconnect: () => undefined,
			},
		} as unknown as BluetoothDevice;
		await expect(connectClickGatt(sleepingDevice, true)).rejects.toThrow(
			'temporarily unavailable'
		);
		expect(await connectClickGatt(sleepingDevice, true)).toBe(server);
		expect(attempts).toBe(2);
	});

	test('emits only new Click V2 minus and plus press edges', () => {
		const minus = parseClickV2Shift(clickMessage(0xff_ff_fe_ff));
		expect(minus?.shifts).toEqual(['down']);
		expect(minus?.heldShifts).toEqual(['down']);
		const heldMinus = parseClickV2Shift(clickMessage(0xff_ff_fe_ff), minus?.buttonMap);
		expect(heldMinus?.shifts).toEqual([]);
		expect(heldMinus?.heldShifts).toEqual(['down']);
		expect(
			parseClickV2Shift(clickMessage(0xff_ff_ff_ff), heldMinus?.buttonMap)?.heldShifts
		).toEqual([]);
		expect(parseClickV2Shift(clickMessage(0xff_ff_ef_ff))?.shifts).toEqual(['up']);
		expect(parseClickV2Shift(view([0x15]))).toBeUndefined();
	});

	test('accepts fixed32 Click button maps for compatibility', () => {
		expect(parseClickV2Shift(view([0x23, 0x0d, 0xff, 0xef, 0xff, 0xff]))?.shifts).toEqual([
			'up',
		]);
	});

	test('deduplicates rapid Click press edges without slowing normal taps', () => {
		expect(shouldAcceptClickShift(undefined, 1000)).toBeTrue();
		expect(shouldAcceptClickShift(1000, 1179)).toBeFalse();
		expect(shouldAcceptClickShift(1000, 1180)).toBeTrue();
	});

	test('deduplicates the same shift mirrored by both Click controllers', () => {
		const lastShiftTimes = new Map();
		expect(filterAcceptedClickShifts(['down'], 1000, lastShiftTimes)).toEqual(['down']);
		expect(filterAcceptedClickShifts(['down'], 1001, lastShiftTimes)).toEqual([]);
		expect(filterAcceptedClickShifts(['up'], 1001, lastShiftTimes)).toEqual(['up']);
	});

	test('registers and corrects Click controller roles from button presses', () => {
		const withPlus = registerClickControllerRole({}, 'plus-device', ['up']);
		expect(withPlus).toEqual({ 'plus-device': 'up' });
		expect(registerClickControllerRole(withPlus, 'plus-device', ['up'])).toBe(withPlus);
		const identified = registerClickControllerRole(withPlus, 'minus-device', ['down']);
		expect(identified).toEqual({
			'minus-device': 'down',
			'plus-device': 'up',
		});
		expect(registerClickControllerRole(identified, 'plus-device', ['down'])).toEqual({
			'minus-device': 'up',
			'plus-device': 'down',
		});
		expect(registerClickControllerRole(withPlus, 'other-device', ['up'])).toEqual({
			'other-device': 'up',
		});
	});

	test('restores at most two remembered Click controller ids', () => {
		expect(storedClickDeviceIds({ getItem: () => '["left","right","extra"]' })).toEqual([
			'left',
			'right',
		]);
		expect(storedClickDeviceIds({ getItem: () => 'broken' })).toEqual([]);
	});

	test('restores valid unique Click controller roles', () => {
		expect(
			storedClickControllerRoles({
				getItem: () => '{"plus":"up","minus":"down","duplicate":"up","bad":"left"}',
			})
		).toEqual({ minus: 'down', plus: 'up' });
		expect(storedClickControllerRoles({ getItem: () => 'broken' })).toEqual({});
	});
});
