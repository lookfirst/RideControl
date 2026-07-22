import { BATTERY, DEVICE_INFORMATION, OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS } from '../constants';
import { createBluetoothNotificationSubscription } from './bluetooth-notifications';
import { withPromiseTimeout } from './promise-timeout';
import {
	type ClickControllerDetails,
	clickBatteryLevel,
	clickV2StartCommand,
	connectClickGatt,
	withClickConnectionTimeout,
	ZWIFT_ASYNC_CHARACTERISTIC,
	ZWIFT_CLICK_SERVICE,
	ZWIFT_LEGACY_SERVICE,
	ZWIFT_SYNC_RX_CHARACTERISTIC,
	ZWIFT_SYNC_TX_CHARACTERISTIC,
} from './zwift-click';

const CLICK_SETUP_STEP_TIMEOUT_MS = 3000;
const BATTERY_LEVEL = 0x2a_19;
const FIRMWARE_REVISION = 0x2a_26;

export class SupersededClickConnectionError extends Error {}

function ensureCurrentConnection(isCurrent: () => boolean) {
	if (!isCurrent()) {
		throw new SupersededClickConnectionError();
	}
}

async function clickService(server: BluetoothRemoteGATTServer) {
	try {
		return await server.getPrimaryService(ZWIFT_CLICK_SERVICE);
	} catch {
		return server.getPrimaryService(ZWIFT_LEGACY_SERVICE);
	}
}

interface ClickDeviceCallbacks {
	isCurrent: () => boolean;
	isOperational: () => boolean;
	onDetails: (details: ClickControllerDetails) => void;
	onDisconnect: () => void;
	onMessage: (event: Event) => void;
}

export interface ClickDeviceConnection {
	cleanup: () => void;
}

function optionalClickDetail<T>(operation: Promise<T>): Promise<T | undefined> {
	return withPromiseTimeout(
		operation,
		OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
		() => new Error('Optional controller detail unavailable.')
	).catch(() => undefined);
}

async function readFirmwareVersion(server: BluetoothRemoteGATTServer): Promise<string | undefined> {
	const value = await (
		await (
			await server.getPrimaryService(DEVICE_INFORMATION)
		).getCharacteristic(FIRMWARE_REVISION)
	).readValue();
	const firmwareVersion = new TextDecoder()
		.decode(value)
		.replaceAll('\0', '')
		.trim()
		.slice(0, 32);
	return firmwareVersion || undefined;
}

async function readBatteryLevel(server: BluetoothRemoteGATTServer): Promise<number | undefined> {
	const value = await (
		await (await server.getPrimaryService(BATTERY)).getCharacteristic(BATTERY_LEVEL)
	).readValue();
	if (!value.byteLength) {
		return;
	}
	const battery = value.getUint8(0);
	return battery <= 100 ? battery : undefined;
}

export async function readClickDeviceDetails(
	server: BluetoothRemoteGATTServer
): Promise<ClickControllerDetails> {
	const firmwareVersion = await optionalClickDetail(readFirmwareVersion(server));
	const battery = await optionalClickDetail(readBatteryLevel(server));
	return {
		...(battery === undefined ? {} : { battery }),
		...(firmwareVersion === undefined ? {} : { firmwareVersion }),
	};
}

export async function inspectClickDeviceDetails(
	device: BluetoothDevice
): Promise<ClickControllerDetails> {
	const server = await connectClickGatt(device, false);
	try {
		return await readClickDeviceDetails(server);
	} finally {
		device.gatt?.disconnect();
	}
}

export async function connectClickDevice(
	device: BluetoothDevice,
	rediscover: boolean,
	{ isCurrent, isOperational, onDetails, onDisconnect, onMessage }: ClickDeviceCallbacks
): Promise<ClickDeviceConnection> {
	const server = await connectClickGatt(device, rediscover);
	ensureCurrentConnection(isCurrent);
	const service = await withClickConnectionTimeout(
		clickService(server),
		CLICK_SETUP_STEP_TIMEOUT_MS
	);
	ensureCurrentConnection(isCurrent);
	const asyncCharacteristic = await withClickConnectionTimeout(
		service.getCharacteristic(ZWIFT_ASYNC_CHARACTERISTIC),
		CLICK_SETUP_STEP_TIMEOUT_MS
	);
	const syncTxCharacteristic = await withClickConnectionTimeout(
		service.getCharacteristic(ZWIFT_SYNC_TX_CHARACTERISTIC),
		CLICK_SETUP_STEP_TIMEOUT_MS
	);
	const syncRxCharacteristic = await withClickConnectionTimeout(
		service.getCharacteristic(ZWIFT_SYNC_RX_CHARACTERISTIC),
		CLICK_SETUP_STEP_TIMEOUT_MS
	);
	ensureCurrentConnection(isCurrent);
	let firstMessageReceived = false;
	let active = true;
	let resolveFirstMessage: () => void = () => undefined;
	const firstMessage = new Promise<void>((resolve) => {
		resolveFirstMessage = resolve;
	});
	const handleMessage = (event: Event) => {
		firstMessageReceived = true;
		resolveFirstMessage();
		const { value } = event.target as BluetoothRemoteGATTCharacteristic;
		const battery = value ? clickBatteryLevel(value) : undefined;
		if (battery !== undefined) {
			onDetails({ battery });
		}
		onMessage(event);
	};
	const asyncNotifications = createBluetoothNotificationSubscription(
		asyncCharacteristic,
		handleMessage
	);
	const syncNotifications = createBluetoothNotificationSubscription(
		syncTxCharacteristic,
		handleMessage
	);
	const cleanup = () => {
		active = false;
		asyncNotifications.cleanup();
		syncNotifications.cleanup();
		device.removeEventListener('gattserverdisconnected', onDisconnect);
	};
	device.addEventListener('gattserverdisconnected', onDisconnect, { once: true });
	try {
		let notificationStarted = false;
		let notificationError: unknown;
		for (const notifications of [asyncNotifications, syncNotifications]) {
			try {
				await withClickConnectionTimeout(
					notifications.start(),
					CLICK_SETUP_STEP_TIMEOUT_MS
				);
				notificationStarted = true;
			} catch (error) {
				notificationError = error;
			}
		}
		if (!(notificationStarted || isOperational())) {
			throw notificationError;
		}
		ensureCurrentConnection(isCurrent);
		try {
			await withClickConnectionTimeout(
				syncRxCharacteristic.writeValueWithoutResponse(clickV2StartCommand()),
				CLICK_SETUP_STEP_TIMEOUT_MS
			);
		} catch (error) {
			if (!isOperational()) {
				throw error;
			}
		}
		ensureCurrentConnection(isCurrent);
		if (!(firstMessageReceived || isOperational())) {
			await withClickConnectionTimeout(firstMessage, CLICK_SETUP_STEP_TIMEOUT_MS);
		}
		ensureCurrentConnection(isCurrent);
		if (isOperational()) {
			readClickDeviceDetails(server).then((details) => {
				if (active && Object.keys(details).length) {
					onDetails(details);
				}
			});
		}
		return { cleanup };
	} catch (error) {
		cleanup();
		throw error;
	}
}
