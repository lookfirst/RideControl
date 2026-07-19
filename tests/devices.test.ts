import { describe, expect, test } from 'bun:test';
import { parseHeartRateMeasurement } from '../src/lib/heart-rate';
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

	test('connects an awake Click immediately and rediscovers after a failed probe', async () => {
		const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { clearTimeout, setTimeout },
		});
		const server = {} as BluetoothRemoteGATTServer;
		const awakeStatuses: string[] = [];
		let advertisementWatches = 0;
		const awakeDevice = {
			addEventListener: () => undefined,
			gatt: {
				connect: () => Promise.resolve(server),
			},
			removeEventListener: () => undefined,
			watchAdvertisements: () => {
				advertisementWatches += 1;
				return Promise.reject(new Error('advertisement already fresh'));
			},
		} as unknown as BluetoothDevice;
		try {
			expect(
				await connectClickGatt(awakeDevice, true, (status) => awakeStatuses.push(status))
			).toBe(server);
			expect(advertisementWatches).toBe(0);
			expect(awakeStatuses).toEqual(['Connecting controllers…']);

			let attempts = 0;
			const sleepingStatuses: string[] = [];
			const sleepingDevice = {
				addEventListener: () => undefined,
				gatt: {
					connect: () => {
						attempts += 1;
						return attempts === 1
							? Promise.reject(new Error('temporarily unavailable'))
							: Promise.resolve(server);
					},
					disconnect: () => undefined,
				},
				removeEventListener: () => undefined,
				watchAdvertisements: () => {
					advertisementWatches += 1;
					return Promise.reject(new Error('advertisement already fresh'));
				},
			} as unknown as BluetoothDevice;
			expect(
				await connectClickGatt(sleepingDevice, true, (status) =>
					sleepingStatuses.push(status)
				)
			).toBe(server);
			expect(attempts).toBe(2);
			expect(advertisementWatches).toBe(1);
			expect(sleepingStatuses).toEqual([
				'Connecting controllers…',
				'Finding controllers…',
				'Connecting controllers…',
			]);
		} finally {
			if (originalWindow) {
				Object.defineProperty(globalThis, 'window', originalWindow);
			} else {
				Reflect.deleteProperty(globalThis, 'window');
			}
		}
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
