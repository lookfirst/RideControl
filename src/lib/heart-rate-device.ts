import { BATTERY, HEART_RATE } from '../constants';
import { startBluetoothNotifications } from './bluetooth-notifications';
import { parseHeartRateMeasurement } from './heart-rate';

const HEART_RATE_MEASUREMENT = 0x2a_37;
const BATTERY_LEVEL = 0x2a_19;

interface HeartRateDeviceCallbacks {
	onDisconnect: () => void;
	onHeartRate: (heartRate: number) => void;
}

export interface HeartRateDeviceConnection {
	battery?: number;
	cleanup: () => void;
}

export async function connectHeartRateDevice(
	device: BluetoothDevice,
	{ onDisconnect, onHeartRate }: HeartRateDeviceCallbacks
): Promise<HeartRateDeviceConnection> {
	const server = await device.gatt?.connect();
	if (!server) {
		throw new Error('This heart rate monitor does not expose Bluetooth services.');
	}
	const service = await server.getPrimaryService(HEART_RATE);
	const measurement = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
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
		handleMeasurement
	);
	let battery: number | undefined;
	try {
		const batteryValue = await (
			await (await server.getPrimaryService(BATTERY)).getCharacteristic(BATTERY_LEVEL)
		).readValue();
		battery = batteryValue.getUint8(0);
	} catch {
		battery = undefined;
	}
	device.addEventListener('gattserverdisconnected', onDisconnect, { once: true });
	return {
		battery,
		cleanup: () => {
			removeMeasurementListener();
			device.removeEventListener('gattserverdisconnected', onDisconnect);
		},
	};
}
