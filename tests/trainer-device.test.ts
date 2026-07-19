import { describe, expect, test } from 'bun:test';
import {
	CONTROL_POINT,
	CYCLING_POWER,
	CYCLING_POWER_MEASUREMENT,
	CYCLING_SPEED_AND_CADENCE,
	FITNESS_MACHINE,
	FITNESS_MACHINE_STATUS,
	INDOOR_BIKE_DATA,
	SUPPORTED_RESISTANCE_LEVEL_RANGE,
} from '../src/constants';
import { connectTrainerDevice } from '../src/lib/trainer-device';

function notificationCharacteristic() {
	const listeners = new Set<EventListenerOrEventListenerObject>();
	return {
		characteristic: {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.add(listener),
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.delete(listener),
			startNotifications: async () => undefined,
		} as unknown as BluetoothRemoteGATTCharacteristic,
		listeners,
	};
}

describe('trainer device connection', () => {
	test('does not block a ready trainer on optional service discovery', async () => {
		const bikeData = notificationCharacteristic();
		const controlPoint = notificationCharacteristic();
		const machineStatus = notificationCharacteristic();
		const optionalPower = notificationCharacteristic();
		let releasePowerService: ((service: BluetoothRemoteGATTService) => void) | undefined;
		const powerService = new Promise<BluetoothRemoteGATTService>((resolve) => {
			releasePowerService = resolve;
		});
		const range = new DataView(new ArrayBuffer(4));
		range.setInt16(0, 0, true);
		range.setInt16(2, 1000, true);
		const fitnessService = {
			getCharacteristic: (uuid: BluetoothServiceUUID) => {
				if (uuid === INDOOR_BIKE_DATA) {
					return bikeData.characteristic;
				}
				if (uuid === CONTROL_POINT) {
					return controlPoint.characteristic;
				}
				if (uuid === FITNESS_MACHINE_STATUS) {
					return machineStatus.characteristic;
				}
				if (uuid === SUPPORTED_RESISTANCE_LEVEL_RANGE) {
					return { readValue: async () => range } as BluetoothRemoteGATTCharacteristic;
				}
				throw new Error(`Unexpected characteristic ${uuid}`);
			},
		} as unknown as BluetoothRemoteGATTService;
		const power = {
			getCharacteristic: (uuid: BluetoothServiceUUID) => {
				expect(uuid).toBe(CYCLING_POWER_MEASUREMENT);
				return optionalPower.characteristic;
			},
		} as unknown as BluetoothRemoteGATTService;
		const server = {
			getPrimaryService: (uuid: BluetoothServiceUUID) => {
				if (uuid === FITNESS_MACHINE) {
					return fitnessService;
				}
				if (uuid === CYCLING_POWER) {
					return powerService;
				}
				if (uuid === CYCLING_SPEED_AND_CADENCE) {
					throw new Error('Optional cadence service unavailable');
				}
				throw new Error(`Unexpected service ${uuid}`);
			},
		} as BluetoothRemoteGATTServer;
		const device = {
			addEventListener: () => undefined,
			gatt: { connect: async () => server },
			removeEventListener: () => undefined,
		} as unknown as BluetoothDevice;

		const connection = await connectTrainerDevice(
			device,
			true,
			{ max: 100, min: 0 },
			{
				onControlRejected: () => undefined,
				onDisconnect: () => undefined,
				onMetrics: () => undefined,
			}
		);
		expect(connection.controlPoint).toBe(controlPoint.characteristic);
		expect(connection.resistanceRange).toEqual({ max: 100, min: 0 });

		connection.cleanup();
		releasePowerService?.(power);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(optionalPower.listeners.size).toBe(0);
	});
});
