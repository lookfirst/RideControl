import { waitForFreshAdvertisement } from './bluetooth';

export const ZWIFT_CLICK_NAME = 'Zwift Click';
export const ZWIFT_CLICK_SERVICE = '0000fc82-0000-1000-8000-00805f9b34fb';
export const ZWIFT_LEGACY_SERVICE = '00000001-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_ASYNC_CHARACTERISTIC = '00000002-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_SYNC_RX_CHARACTERISTIC = '00000003-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_SYNC_TX_CHARACTERISTIC = '00000004-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_MANUFACTURER_ID = 2378;

const CONTROLLER_NOTIFICATION = 0x23;
const MINUS_BUTTON_MASK = 0x01_00;
const PLUS_BUTTON_MASK = 0x10_00;
const ALL_BUTTONS_RELEASED = 0xff_ff_ff_ff;
const CLICK_CONNECTION_TIMEOUT_MS = 8000;
const CLICK_RECONNECT_PROBE_TIMEOUT_MS = 2000;
const CLICK_REDISCOVERY_TIMEOUT_MS = 1600;
const CLICK_REDISCOVERED_CONNECTION_TIMEOUT_MS = 3500;
const CLICK_V2_RIGHT_SIDE = 0x0a;
const CLICK_V2_LEFT_SIDE = 0x0b;

export type ClickShift = 'down' | 'up';
export type ClickControllerRoles = Record<string, ClickShift>;

export function clickControllerRoleFromManufacturerData(
	manufacturerData: BluetoothManufacturerData
): ClickShift | undefined {
	const zwiftData = manufacturerData.get(ZWIFT_MANUFACTURER_ID);
	if (!zwiftData?.byteLength) {
		return;
	}
	const side = zwiftData.getUint8(0);
	if (side === CLICK_V2_RIGHT_SIDE) {
		return 'up';
	}
	if (side === CLICK_V2_LEFT_SIDE) {
		return 'down';
	}
}

export function filterClickShiftsForController(
	shifts: ClickShift[],
	role: ClickShift | undefined
): ClickShift[] {
	return role ? shifts.filter((shift) => shift === role) : shifts;
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

export async function withClickConnectionTimeout<T>(
	connection: Promise<T>,
	timeoutMs = CLICK_CONNECTION_TIMEOUT_MS
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			connection,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error('Controller did not respond. Wake it and try again.')),
					timeoutMs
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
}

export async function connectClickGatt(
	device: BluetoothDevice,
	rediscover: boolean,
	updateStatus: (status: string) => void,
	onControllerRole?: (role: ClickShift) => void
): Promise<BluetoothRemoteGATTServer> {
	const { gatt } = device;
	if (!gatt) {
		throw new Error('This controller does not expose Bluetooth services.');
	}
	const connect = (timeoutMs: number) => {
		updateStatus('Connecting controllers…');
		return withClickConnectionTimeout(gatt.connect(), timeoutMs);
	};
	const observeController = () =>
		waitForFreshAdvertisement(
			device,
			(event) => {
				const role = clickControllerRoleFromManufacturerData(event.manufacturerData);
				if (role) {
					onControllerRole?.(role);
				}
			},
			CLICK_REDISCOVERY_TIMEOUT_MS
		);
	// Observe the side identity concurrently so it does not slow an awake controller's
	// direct connection. The same observation doubles as wake discovery if that probe fails.
	const advertisement = onControllerRole ? observeController() : undefined;
	try {
		return await connect(
			rediscover ? CLICK_RECONNECT_PROBE_TIMEOUT_MS : CLICK_CONNECTION_TIMEOUT_MS
		);
	} catch {
		gatt.disconnect();
		updateStatus('Finding controllers…');
		await (advertisement ?? observeController());
		return connect(CLICK_REDISCOVERED_CONNECTION_TIMEOUT_MS);
	}
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

export function registerClickControllerRole(
	roles: ClickControllerRoles,
	deviceId: string,
	shifts: ClickShift[]
): ClickControllerRoles {
	const role = shifts.length === 1 ? shifts[0] : undefined;
	if (!role || roles[deviceId] === role) {
		return roles;
	}
	const previousRole = roles[deviceId];
	const next = { ...roles };
	for (const [otherDeviceId, otherRole] of Object.entries(next)) {
		if (otherDeviceId !== deviceId && otherRole === role) {
			if (previousRole) {
				next[otherDeviceId] = previousRole;
			} else {
				delete next[otherDeviceId];
			}
		}
	}
	next[deviceId] = role;
	return next;
}

function pressedShifts(buttonMap: number): ClickShift[] {
	const shifts: ClickShift[] = [];
	if ((buttonMap & MINUS_BUTTON_MASK) === 0) {
		shifts.push('down');
	}
	if ((buttonMap & PLUS_BUTTON_MASK) === 0) {
		shifts.push('up');
	}
	return shifts;
}

export function clickV2StartCommand(): ArrayBuffer {
	const command = new ArrayBuffer(8);
	new Uint8Array(command).set([0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 0x02, 0x03]);
	return command;
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
	if ((previousButtonMap & MINUS_BUTTON_MASK) !== 0 && (buttonMap & MINUS_BUTTON_MASK) === 0) {
		shifts.push('down');
	}
	if ((previousButtonMap & PLUS_BUTTON_MASK) !== 0 && (buttonMap & PLUS_BUTTON_MASK) === 0) {
		shifts.push('up');
	}
	return { buttonMap, heldShifts: pressedShifts(buttonMap), shifts };
}

export function storedClickDeviceIds(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
	try {
		const saved = JSON.parse(storage.getItem('zwift-click-v2-device-ids') ?? '[]');
		return Array.isArray(saved)
			? saved.filter((value): value is string => typeof value === 'string').slice(0, 2)
			: [];
	} catch {
		return [];
	}
}

export function storedClickControllerRoles(
	storage: Pick<Storage, 'getItem'> = localStorage
): ClickControllerRoles {
	try {
		const saved = JSON.parse(storage.getItem('zwift-click-v2-controller-roles') ?? '{}');
		if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
			return {};
		}
		const roles: ClickControllerRoles = {};
		for (const [deviceId, role] of Object.entries(saved)) {
			if ((role === 'up' || role === 'down') && !Object.values(roles).includes(role)) {
				roles[deviceId] = role;
			}
		}
		return roles;
	} catch {
		return {};
	}
}
