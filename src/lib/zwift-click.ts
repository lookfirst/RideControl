import { BATTERY, BLUETOOTH_GATT_CONNECTION_TIMEOUT_MS, DEVICE_INFORMATION } from '../constants';
import { bluetoothGattCoordinator } from './bluetooth-gatt-coordinator';
import { withPromiseTimeout } from './promise-timeout';
import { isRecord, isString } from './type-guards';

export const ZWIFT_CLICK_NAME = 'Zwift Click';
export const ZWIFT_CLICK_SERVICE = '0000fc82-0000-1000-8000-00805f9b34fb';
export const ZWIFT_LEGACY_SERVICE = '00000001-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_ASYNC_CHARACTERISTIC = '00000002-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_SYNC_RX_CHARACTERISTIC = '00000003-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_SYNC_TX_CHARACTERISTIC = '00000004-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_MANUFACTURER_ID = 2378;
export const CLICK_DEVICE_IDS_STORAGE_KEY = 'zwift-click-v2-device-ids';
export const CLICK_CONTROLLER_ROLES_STORAGE_KEY = 'zwift-click-v2-controller-roles';
export const CLICK_CONTROLLER_DEVICES_STORAGE_KEY = 'zwift-click-v2-controller-devices';
export const CLICK_CONTROLLER_DETAILS_STORAGE_KEY = 'zwift-click-v2-controller-details';
export const CLICK_LATEST_FIRMWARE_VERSION = '1.2.0';
export const MAX_CLICK_CONTROLLERS = 2;
export const CLICK_SHIFT = {
	DOWN: 'down',
	UP: 'up',
} as const;
// The domain model retains both physical roles so the second controller can be
// supported later. Ride Control currently pairs only the reliable + controller.
export const CLICK_CONTROLLER_ORDER = [CLICK_SHIFT.UP] as const;

const CONTROLLER_NOTIFICATION = 0x23;
const MINUS_BUTTON_MASK = 0x01_00;
const PLUS_BUTTON_MASK = 0x10_00;
const Y_BUTTON_MASK = 0x00_40;
const ALL_BUTTONS_RELEASED = 0xff_ff_ff_ff;
const CLICK_CONNECTION_TIMEOUT_MS = BLUETOOTH_GATT_CONNECTION_TIMEOUT_MS;
const CLICK_V2_RIGHT_SIDE = 0x0a;
const CLICK_V2_LEFT_SIDE = 0x0b;
const CLICK_V2_BATTERY_NOTIFICATION = 0x19;

export type ClickShift = (typeof CLICK_SHIFT)[keyof typeof CLICK_SHIFT];
export type ClickControllerDeviceIds = Partial<Record<ClickShift, string>>;
export interface ClickControllerDetails {
	battery?: number;
	firmwareVersion?: string;
}
export type ClickControllerDetailsByRole = Partial<Record<ClickShift, ClickControllerDetails>>;

const CLICK_V2_SIDE_BY_ROLE: Record<ClickShift, number> = {
	[CLICK_SHIFT.DOWN]: CLICK_V2_LEFT_SIDE,
	[CLICK_SHIFT.UP]: CLICK_V2_RIGHT_SIDE,
};

export function clickControllerLabel(role: ClickShift): string {
	return role === CLICK_SHIFT.UP ? '+ Controller' : '− Controller';
}

export function clickControllerRequestOptions(role: ClickShift): RequestDeviceOptions {
	return {
		filters: [
			{
				manufacturerData: [
					{
						companyIdentifier: ZWIFT_MANUFACTURER_ID,
						dataPrefix: new Uint8Array([CLICK_V2_SIDE_BY_ROLE[role]]),
					},
				],
			},
		],
		optionalManufacturerData: [ZWIFT_MANUFACTURER_ID],
		optionalServices: [ZWIFT_CLICK_SERVICE, ZWIFT_LEGACY_SERVICE, BATTERY, DEVICE_INFORMATION],
	};
}

export function clickFirmwareNeedsUpdate(firmwareVersion: string | undefined): boolean {
	return firmwareVersion !== undefined && firmwareVersion !== CLICK_LATEST_FIRMWARE_VERSION;
}

export function clickControllerRoleFromManufacturerData(
	manufacturerData: BluetoothManufacturerData
): ClickShift | undefined {
	const zwiftData = manufacturerData.get(ZWIFT_MANUFACTURER_ID);
	if (!zwiftData?.byteLength) {
		return;
	}
	const side = zwiftData.getUint8(0);
	if (side === CLICK_V2_RIGHT_SIDE) {
		return CLICK_SHIFT.UP;
	}
	if (side === CLICK_V2_LEFT_SIDE) {
		return CLICK_SHIFT.DOWN;
	}
}

export function shouldMaintainClickConnection(
	automaticReconnect: boolean,
	connectionActive: boolean,
	forgotten: boolean
): boolean {
	return automaticReconnect && connectionActive && !forgotten;
}

export function abortPendingClickConnectionOnAdvertisement(
	device: BluetoothDevice,
	connectionPending: boolean
): boolean {
	const { gatt } = device;
	if (!(connectionPending && gatt && !gatt.connected)) {
		return false;
	}
	// Web Bluetooth disconnect() aborts an outstanding connect(). This lets the
	// reconnect controller immediately retry against the newly awake Click.
	gatt.disconnect();
	return true;
}

export function clickConnectionActiveForSession({
	ended,
	manuallyPaused,
}: {
	ended: boolean;
	manuallyPaused: boolean;
}): boolean {
	return !(ended || manuallyPaused);
}

export function filterClickShiftsForController(
	shifts: ClickShift[],
	role: ClickShift | undefined
): ClickShift[] {
	if (role === CLICK_SHIFT.DOWN) {
		return shifts.filter((shift) => shift === CLICK_SHIFT.DOWN);
	}
	return shifts;
}

export async function waitForUsableClickNotification(
	attempts: readonly Promise<unknown>[],
	receivedMessage: () => boolean
): Promise<void> {
	try {
		await Promise.any(attempts);
	} catch (error) {
		if (!receivedMessage()) {
			throw error;
		}
	}
}

export function withClickConnectionTimeout<T>(
	connection: Promise<T>,
	timeoutMs = CLICK_CONNECTION_TIMEOUT_MS
): Promise<T> {
	return withPromiseTimeout(
		connection,
		timeoutMs,
		() => new Error('Controller did not respond. Wake it and try again.')
	);
}

export function connectClickGatt(
	device: BluetoothDevice,
	_rediscover: boolean
): Promise<BluetoothRemoteGATTServer> {
	const { gatt } = device;
	if (!gatt) {
		return Promise.reject(new Error('This controller does not expose Bluetooth services.'));
	}
	return bluetoothGattCoordinator.connect(
		device,
		CLICK_CONNECTION_TIMEOUT_MS,
		'Controller did not respond. Wake it and try again.'
	);
}

export function shouldAcceptClickShift(
	lastAcceptedAt: number | undefined,
	receivedAt: number,
	minimumInterval = 180
): boolean {
	return lastAcceptedAt === undefined || receivedAt - lastAcceptedAt >= minimumInterval;
}

export function filterAcceptedClickShifts(
	shifts: ClickShift[],
	receivedAt: number,
	lastShiftTimes: Map<ClickShift, number>
): ClickShift[] {
	return shifts.filter((shift) => {
		if (!shouldAcceptClickShift(lastShiftTimes.get(shift), receivedAt)) {
			return false;
		}
		lastShiftTimes.set(shift, receivedAt);
		return true;
	});
}

function pressedShifts(buttonMap: number): ClickShift[] {
	const shifts: ClickShift[] = [];
	if ((buttonMap & MINUS_BUTTON_MASK) === 0 || (buttonMap & Y_BUTTON_MASK) === 0) {
		shifts.push(CLICK_SHIFT.DOWN);
	}
	if ((buttonMap & PLUS_BUTTON_MASK) === 0) {
		shifts.push(CLICK_SHIFT.UP);
	}
	return shifts;
}

export function clickV2StartCommand(): ArrayBuffer {
	const command = new ArrayBuffer(8);
	new Uint8Array(command).set([0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 0x02, 0x03]);
	return command;
}

function unsignedVarint(bytes: Uint8Array, offset: number): number | undefined {
	let value = 0;
	let multiplier = 1;
	for (let index = offset; index < bytes.length && multiplier <= 2 ** 28; index += 1) {
		const byte = bytes[index];
		if (byte === undefined) {
			return;
		}
		value += (byte & 0x7f) * multiplier;
		if ((byte & 0x80) === 0) {
			return value >>> 0;
		}
		multiplier *= 128;
	}
}

export function clickBatteryLevel(value: DataView): number | undefined {
	const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	if (bytes[0] !== CLICK_V2_BATTERY_NOTIFICATION) {
		return;
	}
	const percentageTagOffset = bytes.indexOf(0x10, 1);
	const protobufPercentage =
		percentageTagOffset < 0 ? undefined : unsignedVarint(bytes, percentageTagOffset + 1);
	const legacyPercentage = bytes[1] === 0 ? bytes[2] : undefined;
	const percentage = protobufPercentage ?? legacyPercentage;
	return percentage !== undefined && percentage <= 100 ? percentage : undefined;
}

function readButtonMap(message: Uint8Array): number | undefined {
	const tagOffset = message.indexOf(0x08);
	if (tagOffset >= 0) {
		let value = 0;
		let multiplier = 1;
		for (
			let offset = tagOffset + 1;
			offset < message.length && multiplier <= 2 ** 28;
			offset += 1
		) {
			const byte = message[offset];
			if (byte === undefined) {
				return;
			}
			value += (byte & 0x7f) * multiplier;
			if ((byte & 0x80) === 0) {
				return value >>> 0;
			}
			multiplier *= 128;
		}
	}

	// Some early community implementations exposed this uint32 as fixed32.
	// Accepting it keeps the decoder tolerant while V2 hardware uses the varint field above.
	const fixedTagOffset = message.indexOf(0x0d);
	const fixedValueOffset = fixedTagOffset + 1;
	if (fixedTagOffset < 0 || fixedValueOffset + 4 > message.length) {
		return;
	}
	return new DataView(message.buffer, message.byteOffset + fixedValueOffset, 4).getUint32(
		0,
		true
	);
}

export function parseClickV2Shift(
	value: DataView,
	previousButtonMap = ALL_BUTTONS_RELEASED
): { buttonMap: number; heldShifts: ClickShift[]; shifts: ClickShift[] } | undefined {
	const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	if (bytes[0] !== CONTROLLER_NOTIFICATION) {
		return;
	}
	const buttonMap = readButtonMap(bytes.subarray(1));
	if (buttonMap === undefined) {
		return;
	}
	const shifts: ClickShift[] = [];
	if (
		((previousButtonMap & MINUS_BUTTON_MASK) !== 0 && (buttonMap & MINUS_BUTTON_MASK) === 0) ||
		((previousButtonMap & Y_BUTTON_MASK) !== 0 && (buttonMap & Y_BUTTON_MASK) === 0)
	) {
		shifts.push(CLICK_SHIFT.DOWN);
	}
	if ((previousButtonMap & PLUS_BUTTON_MASK) !== 0 && (buttonMap & PLUS_BUTTON_MASK) === 0) {
		shifts.push(CLICK_SHIFT.UP);
	}
	return { buttonMap, heldShifts: pressedShifts(buttonMap), shifts };
}

export function storedClickDeviceIds(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
	try {
		const saved = JSON.parse(storage.getItem(CLICK_DEVICE_IDS_STORAGE_KEY) ?? '[]');
		return Array.isArray(saved) ? saved.filter(isString).slice(0, MAX_CLICK_CONTROLLERS) : [];
	} catch {
		return [];
	}
}

export function storedClickControllerRoles(
	storage: Pick<Storage, 'getItem'> = localStorage
): Record<string, ClickShift> {
	try {
		const saved = JSON.parse(storage.getItem(CLICK_CONTROLLER_ROLES_STORAGE_KEY) ?? '{}');
		if (!isRecord(saved)) {
			return {};
		}
		const roles: Record<string, ClickShift> = {};
		for (const [deviceId, role] of Object.entries(saved)) {
			if (
				(role === CLICK_SHIFT.UP || role === CLICK_SHIFT.DOWN) &&
				!Object.values(roles).includes(role)
			) {
				roles[deviceId] = role;
			}
		}
		return roles;
	} catch {
		return {};
	}
}

function parsedControllerDeviceIds(value: unknown): ClickControllerDeviceIds {
	if (!isRecord(value)) {
		return {};
	}
	const controllerIds: ClickControllerDeviceIds = {};
	const usedDeviceIds = new Set<string>();
	for (const role of CLICK_CONTROLLER_ORDER) {
		const deviceId = value[role];
		if (isString(deviceId) && !usedDeviceIds.has(deviceId)) {
			controllerIds[role] = deviceId;
			usedDeviceIds.add(deviceId);
		}
	}
	return controllerIds;
}

export function storedClickControllerDeviceIds(
	storage: Pick<Storage, 'getItem'> = localStorage
): ClickControllerDeviceIds {
	try {
		const current = parsedControllerDeviceIds(
			JSON.parse(storage.getItem(CLICK_CONTROLLER_DEVICES_STORAGE_KEY) ?? 'null')
		);
		if (Object.keys(current).length) {
			return current;
		}
	} catch {
		// Fall through to the legacy device-id and role records.
	}
	const legacyDeviceIds = new Set(storedClickDeviceIds(storage));
	const migrated: ClickControllerDeviceIds = {};
	for (const [deviceId, role] of Object.entries(storedClickControllerRoles(storage))) {
		if (
			CLICK_CONTROLLER_ORDER.some((enabledRole) => enabledRole === role) &&
			legacyDeviceIds.has(deviceId) &&
			migrated[role] === undefined
		) {
			migrated[role] = deviceId;
		}
	}
	return migrated;
}

function parsedControllerDetails(value: unknown): ClickControllerDetailsByRole {
	if (!isRecord(value)) {
		return {};
	}
	const detailsByRole: ClickControllerDetailsByRole = {};
	for (const role of CLICK_CONTROLLER_ORDER) {
		const valueForRole = value[role];
		if (!isRecord(valueForRole)) {
			continue;
		}
		const details: ClickControllerDetails = {};
		const { battery, firmwareVersion } = valueForRole;
		if (
			typeof battery === 'number' &&
			Number.isInteger(battery) &&
			battery >= 0 &&
			battery <= 100
		) {
			details.battery = battery;
		}
		if (isString(firmwareVersion)) {
			const normalizedFirmwareVersion = firmwareVersion.trim().slice(0, 32);
			if (normalizedFirmwareVersion) {
				details.firmwareVersion = normalizedFirmwareVersion;
			}
		}
		if (Object.keys(details).length) {
			detailsByRole[role] = details;
		}
	}
	return detailsByRole;
}

export function storedClickControllerDetails(
	storage: Pick<Storage, 'getItem'> = localStorage
): ClickControllerDetailsByRole {
	try {
		return parsedControllerDetails(
			JSON.parse(storage.getItem(CLICK_CONTROLLER_DETAILS_STORAGE_KEY) ?? '{}')
		);
	} catch {
		return {};
	}
}
