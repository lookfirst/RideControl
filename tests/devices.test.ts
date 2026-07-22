import { describe, expect, test } from 'bun:test';
import { BATTERY, DEVICE_INFORMATION, HEART_RATE } from '../src/constants';
import { parseHeartRateMeasurement } from '../src/lib/heart-rate';
import { connectHeartRateDevice } from '../src/lib/heart-rate-device';
import {
	abortPendingClickConnectionOnAdvertisement,
	CLICK_CONTROLLER_DETAILS_STORAGE_KEY,
	CLICK_CONTROLLER_DEVICES_STORAGE_KEY,
	CLICK_CONTROLLER_ORDER,
	CLICK_CONTROLLER_ROLES_STORAGE_KEY,
	CLICK_DEVICE_IDS_STORAGE_KEY,
	clickBatteryLevel,
	clickConnectionActiveForSession,
	clickControllerRequestOptions,
	clickControllerRoleFromManufacturerData,
	clickFirmwareNeedsUpdate,
	clickV2StartCommand,
	connectClickGatt,
	filterAcceptedClickShifts,
	filterClickShiftsForController,
	parseClickV2Shift,
	shouldAcceptClickShift,
	shouldMaintainClickConnection,
	storedClickControllerDetails,
	storedClickControllerDeviceIds,
	storedClickControllerRoles,
	storedClickDeviceIds,
	waitForUsableClickNotification,
	withClickConnectionTimeout,
} from '../src/lib/zwift-click';
import { connectClickDevice, readClickDeviceDetails } from '../src/lib/zwift-click-device';
import { createZwiftClickStore } from '../src/stores/zwift-click-store';

function view(bytes: number[]) {
	return new DataView(new Uint8Array(bytes).buffer);
}

function bufferSourceBytes(value: BufferSource): number[] {
	return ArrayBuffer.isView(value)
		? [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]
		: [...new Uint8Array(value)];
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

	test('exposes only the + slot while retaining role-specific protocol filters', () => {
		expect(CLICK_CONTROLLER_ORDER).toEqual(['up']);
		for (const [role, side] of [
			['up', 0x0a],
			['down', 0x0b],
		] as const) {
			const options = clickControllerRequestOptions(role);
			if (!('filters' in options)) {
				throw new Error('Expected role-specific Click filters.');
			}
			const manufacturer = options.filters?.[0]?.manufacturerData?.[0];
			expect(manufacturer?.companyIdentifier).toBe(2378);
			const prefix = manufacturer?.dataPrefix;
			expect(prefix && bufferSourceBytes(prefix)).toEqual([side]);
			expect(options.optionalServices).toContain(BATTERY);
			expect(options.optionalServices).toContain(DEVICE_INFORMATION);
		}
	});

	test('parses Click battery notifications and detects stale firmware', () => {
		expect(clickBatteryLevel(view([0x19, 0x10, 87]))).toBe(87);
		expect(clickBatteryLevel(view([0x19, 0, 62]))).toBe(62);
		expect(clickBatteryLevel(view([0x19, 0x10, 101]))).toBeUndefined();
		expect(clickBatteryLevel(view([0x23, 0x10, 87]))).toBeUndefined();
		expect(clickFirmwareNeedsUpdate('1.1.0')).toBeTrue();
		expect(clickFirmwareNeedsUpdate('1.2.0')).toBeFalse();
		expect(clickFirmwareNeedsUpdate(undefined)).toBeFalse();
	});

	test('reads optional Click firmware and battery characteristics', async () => {
		const firmwareCharacteristic = {
			readValue: () => Promise.resolve(view([0x31, 0x2e, 0x32, 0x2e, 0x30, 0])),
		} as unknown as BluetoothRemoteGATTCharacteristic;
		const batteryCharacteristic = {
			readValue: () => Promise.resolve(view([84])),
		} as unknown as BluetoothRemoteGATTCharacteristic;
		const server = {
			getPrimaryService: (service: BluetoothServiceUUID) =>
				Promise.resolve({
					getCharacteristic: () =>
						Promise.resolve(
							service === DEVICE_INFORMATION
								? firmwareCharacteristic
								: batteryCharacteristic
						),
				} as unknown as BluetoothRemoteGATTService),
		} as unknown as BluetoothRemoteGATTServer;

		expect(await readClickDeviceDetails(server)).toEqual({
			battery: 84,
			firmwareVersion: '1.2.0',
		});
	});

	test('keeps Click connections only while a ride session is active', () => {
		expect(shouldMaintainClickConnection(true, true, false)).toBeTrue();
		expect(shouldMaintainClickConnection(true, false, false)).toBeFalse();
		expect(shouldMaintainClickConnection(false, true, false)).toBeFalse();
		expect(shouldMaintainClickConnection(true, true, true)).toBeFalse();
	});

	test('restarts an in-flight Click connection when the sleeping controller advertises', () => {
		let disconnects = 0;
		const sleepingDevice = {
			gatt: {
				connected: false,
				disconnect: () => {
					disconnects += 1;
				},
			},
		} as unknown as BluetoothDevice;
		expect(abortPendingClickConnectionOnAdvertisement(sleepingDevice, true)).toBeTrue();
		expect(disconnects).toBe(1);

		const connectedDevice = {
			gatt: {
				connected: true,
				disconnect: () => {
					disconnects += 1;
				},
			},
		} as unknown as BluetoothDevice;
		expect(abortPendingClickConnectionOnAdvertisement(connectedDevice, true)).toBeFalse();
		expect(abortPendingClickConnectionOnAdvertisement(sleepingDevice, false)).toBeFalse();
		expect(disconnects).toBe(1);
	});

	test('keeps Click active through auto-pause but not manual pause', () => {
		expect(
			clickConnectionActiveForSession({
				ended: false,
				manuallyPaused: false,
			})
		).toBeTrue();
		expect(
			clickConnectionActiveForSession({
				ended: false,
				manuallyPaused: true,
			})
		).toBeFalse();
		expect(
			clickConnectionActiveForSession({
				ended: true,
				manuallyPaused: false,
			})
		).toBeFalse();
	});

	test('starts and observes an established + controller session', async () => {
		const details: Array<{ battery?: number; firmwareVersion?: string }> = [];
		const writes: number[][] = [];
		const messageListeners = new Set<EventListenerOrEventListenerObject>();
		const notificationCharacteristic = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				messageListeners.add(listener),
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				messageListeners.delete(listener),
			startNotifications: () => {
				for (const listener of messageListeners) {
					const event = {
						target: { value: view([0x19, 0x10, 73]) },
					} as unknown as Event;
					if (typeof listener === 'function') {
						listener(event);
					} else {
						listener.handleEvent(event);
					}
				}
				return Promise.resolve();
			},
		} as unknown as BluetoothRemoteGATTCharacteristic;
		const syncRxCharacteristic = {
			writeValueWithoutResponse: (value: BufferSource) => {
				const bytes = ArrayBuffer.isView(value)
					? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
					: new Uint8Array(value);
				writes.push([...bytes]);
				return Promise.resolve();
			},
		} as unknown as BluetoothRemoteGATTCharacteristic;
		let characteristicIndex = 0;
		const service = {
			getCharacteristic: () => {
				const characteristic = [
					notificationCharacteristic,
					notificationCharacteristic,
					syncRxCharacteristic,
				][characteristicIndex];
				characteristicIndex += 1;
				return Promise.resolve(characteristic);
			},
		} as unknown as BluetoothRemoteGATTService;
		const server = {
			getPrimaryService: () => Promise.resolve(service),
		} as unknown as BluetoothRemoteGATTServer;
		const device = {
			addEventListener: () => undefined,
			gatt: {
				connect: () => Promise.resolve(server),
				connected: false,
				disconnect: () => undefined,
			},
			id: 'click-reset-protocol',
			removeEventListener: () => undefined,
		} as unknown as BluetoothDevice;
		const connection = await connectClickDevice(device, false, {
			isCurrent: () => true,
			isOperational: () => false,
			onDetails: (controllerDetails) => details.push(controllerDetails),
			onDisconnect: () => undefined,
			onMessage: () => undefined,
		});

		expect(writes[0]).toEqual([0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 0x02, 0x03]);
		expect(details).toContainEqual({ battery: 73 });
		connection.cleanup();
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

	test('accepts + and Y shifts from the + controller while retaining the future − filter', () => {
		expect(filterClickShiftsForController(['down', 'up'], 'up')).toEqual(['down', 'up']);
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

	test('maps the + controller Y button to down and emits only new press edges', () => {
		const yButton = parseClickV2Shift(clickMessage(0xff_ff_ff_bf));
		expect(yButton?.shifts).toEqual(['down']);
		expect(yButton?.heldShifts).toEqual(['down']);
		const heldY = parseClickV2Shift(clickMessage(0xff_ff_ff_bf), yButton?.buttonMap);
		expect(heldY?.shifts).toEqual([]);
		expect(heldY?.heldShifts).toEqual(['down']);
		expect(
			parseClickV2Shift(clickMessage(0xff_ff_ff_ff), heldY?.buttonMap)?.heldShifts
		).toEqual([]);
		expect(parseClickV2Shift(clickMessage(0xff_ff_ef_ff))?.shifts).toEqual(['up']);
		expect(parseClickV2Shift(clickMessage(0xff_ff_fe_ff))?.shifts).toEqual(['down']);
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

	test('restores only the + slot and migrates its legacy identity record', () => {
		expect(
			storedClickControllerDeviceIds({
				getItem: (key) =>
					key === CLICK_CONTROLLER_DEVICES_STORAGE_KEY
						? '{"up":"plus-device","down":"minus-device"}'
						: null,
			})
		).toEqual({ up: 'plus-device' });
		expect(
			storedClickControllerDeviceIds({
				getItem: (key) =>
					key === CLICK_CONTROLLER_DEVICES_STORAGE_KEY
						? '{"up":"same-device","down":"same-device"}'
						: null,
			})
		).toEqual({ up: 'same-device' });
		expect(
			storedClickControllerDeviceIds({
				getItem: (key) => {
					if (key === CLICK_DEVICE_IDS_STORAGE_KEY) {
						return '["plus-device","minus-device"]';
					}
					if (key === CLICK_CONTROLLER_ROLES_STORAGE_KEY) {
						return '{"plus-device":"up","minus-device":"down"}';
					}
					return null;
				},
			})
		).toEqual({ up: 'plus-device' });
	});

	test('restores only valid persisted Click firmware and battery details', () => {
		expect(
			storedClickControllerDetails({
				getItem: (key) =>
					key === CLICK_CONTROLLER_DETAILS_STORAGE_KEY
						? '{"up":{"firmwareVersion":" 1.2.0 ","battery":91},"down":{"firmwareVersion":"1.1.0","battery":101}}'
						: null,
			})
		).toEqual({ up: { battery: 91, firmwareVersion: '1.2.0' } });
		expect(storedClickControllerDetails({ getItem: () => 'broken' })).toEqual({});
	});

	test('stores each physical Click controller in an independent fixed slot', () => {
		const store = createZwiftClickStore();
		store.actions.activateController('up', 'down');
		expect(store.get().activeControllerShifts).toEqual({ up: 'down' });
		store.actions.activateController('up', 'up');
		expect(store.get().activeControllerShifts).toEqual({ up: 'up' });
		store.actions.setController('up', 'plus-device');
		store.actions.setController('down', 'minus-device');
		store.actions.setControllerPhase('up', 'connected');
		store.actions.setControllerPhase('down', 'reconnecting');
		store.actions.setControllerDetails('up', { battery: 84, firmwareVersion: '1.2.0' });
		expect(store.get()).toMatchObject({
			controllerDetails: { up: { battery: 84, firmwareVersion: '1.2.0' } },
			controllerIds: { down: 'minus-device', up: 'plus-device' },
			controllerPhases: { down: 'reconnecting', up: 'connected' },
		});
		store.actions.removeController('down');
		store.actions.deactivateController('up');
		expect(store.get().activeControllerShifts).toEqual({});
		expect(store.get().controllerIds).toEqual({ up: 'plus-device' });
		expect(store.get().controllerPhases).toEqual({ up: 'connected' });
		expect(store.get().controllerDetails).toEqual({
			up: { battery: 84, firmwareVersion: '1.2.0' },
		});
	});
});
