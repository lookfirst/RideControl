import { createBluetoothNotificationSubscription } from './bluetooth-notifications';
import {
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
	onDisconnect: () => void;
	onMessage: (event: Event) => void;
}

export async function connectClickDevice(
	device: BluetoothDevice,
	rediscover: boolean,
	{ isCurrent, isOperational, onDisconnect, onMessage }: ClickDeviceCallbacks
): Promise<() => void> {
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
	const asyncNotifications = createBluetoothNotificationSubscription(
		asyncCharacteristic,
		onMessage
	);
	const syncNotifications = createBluetoothNotificationSubscription(
		syncTxCharacteristic,
		onMessage
	);
	const cleanup = () => {
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
		return cleanup;
	} catch (error) {
		cleanup();
		throw error;
	}
}
