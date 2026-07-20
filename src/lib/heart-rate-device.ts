import { BATTERY, HEART_RATE, OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS } from '../constants';
import { connectGatt } from './bluetooth';
import { startBluetoothNotifications } from './bluetooth-notifications';
import { withBluetoothOperationTimeout } from './bluetooth-operation';
import { parseHeartRateMeasurement } from './heart-rate';
import { withPromiseTimeout } from './promise-timeout';

const HEART_RATE_MEASUREMENT = 0x2a_37;
const BATTERY_LEVEL = 0x2a_19;

interface HeartRateDeviceCallbacks {
	onBattery: (battery: number) => void;
	onDisconnect: () => void;
	onHeartRate: (heartRate: number) => void;
}

export interface HeartRateDeviceConnection {
	cleanup: () => void;
}

async function readBatteryLevel(server: BluetoothRemoteGATTServer): Promise<number> {
	const batteryValue = await (
		await (await server.getPrimaryService(BATTERY)).getCharacteristic(BATTERY_LEVEL)
	).readValue();
	return batteryValue.getUint8(0);
}

export async function connectHeartRateDevice(
	device: BluetoothDevice,
	rediscover: boolean,
	{ onBattery, onDisconnect, onHeartRate }: HeartRateDeviceCallbacks,
	operationTimeoutMs?: number
): Promise<HeartRateDeviceConnection> {
	const server = await connectGatt(device, rediscover);
	const service = await withBluetoothOperationTimeout(
		server.getPrimaryService(HEART_RATE),
		'Heart rate service discovery',
		operationTimeoutMs
	);
	const measurement = await withBluetoothOperationTimeout(
		service.getCharacteristic(HEART_RATE_MEASUREMENT),
		'Heart rate measurement discovery',
		operationTimeoutMs
	);
	const handleMeasurement = (event: Event) => {
		const { value } = event.target as BluetoothRemoteGATTCharacteristic;
		if (!value) {
			return;
		}
		const heartRate = parseHeartRateMeasurement(value);
		if (heartRate !== undefined) {
			onHeartRate(heartRate);
		}
	};
	const removeMeasurementListener = await startBluetoothNotifications(
		measurement,
		handleMeasurement,
		operationTimeoutMs
	);
	let active = true;
	withPromiseTimeout(
		readBatteryLevel(server),
		OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
		() => new Error('Battery level unavailable.')
	).then(
		(battery) => {
			if (active) {
				onBattery(battery);
			}
		},
		() => undefined
	);
	device.addEventListener('gattserverdisconnected', onDisconnect, { once: true });
	return {
		cleanup: () => {
			active = false;
			removeMeasurementListener();
			device.removeEventListener('gattserverdisconnected', onDisconnect);
		},
	};
}
