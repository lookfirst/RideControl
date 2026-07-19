import {
	CONTROL_POINT,
	CSC_MEASUREMENT,
	CYCLING_POWER,
	CYCLING_POWER_MEASUREMENT,
	CYCLING_SPEED_AND_CADENCE,
	FITNESS_MACHINE,
	FITNESS_MACHINE_STATUS,
	INDOOR_BIKE_DATA,
	SUPPORTED_RESISTANCE_LEVEL_RANGE,
} from '../constants';
import type { Metrics, Range } from '../types';
import {
	characteristicValue,
	connectGatt,
	parseCrankCadence,
	parseIndoorBikeData,
} from './bluetooth';
import { combineBluetoothCleanups, startBluetoothNotifications } from './bluetooth-notifications';

interface TrainerDeviceCallbacks {
	onControlRejected: () => void;
	onDisconnect: () => void;
	onMetrics: (metrics: Partial<Metrics>, reportsDistance: boolean) => void;
}

export interface TrainerDeviceConnection {
	cleanup: () => void;
	controlPoint: BluetoothRemoteGATTCharacteristic;
	resistanceRange: Range;
}

async function optionalPowerSubscription(
	server: BluetoothRemoteGATTServer,
	onMetrics: TrainerDeviceCallbacks['onMetrics']
) {
	try {
		const measurement = await (await server.getPrimaryService(CYCLING_POWER)).getCharacteristic(
			CYCLING_POWER_MEASUREMENT
		);
		return await startBluetoothNotifications(measurement, (event) => {
			const value = characteristicValue(event);
			if (value) {
				onMetrics({ power: value.getInt16(2, true) }, false);
			}
		});
	} catch {
		// Indoor Bike Data is the normal power source.
	}
}

async function optionalCadenceSubscription(
	server: BluetoothRemoteGATTServer,
	onMetrics: TrainerDeviceCallbacks['onMetrics']
) {
	let previousCrank: { revolutions: number; time: number } | undefined;
	try {
		const measurement = await (
			await server.getPrimaryService(CYCLING_SPEED_AND_CADENCE)
		).getCharacteristic(CSC_MEASUREMENT);
		return await startBluetoothNotifications(measurement, (event) => {
			const value = characteristicValue(event);
			if (!value) {
				return;
			}
			const parsed = parseCrankCadence(value, previousCrank);
			previousCrank = parsed.current ?? previousCrank;
			if (parsed.cadence !== undefined) {
				onMetrics({ cadence: parsed.cadence }, false);
			}
		});
	} catch {
		// CSC cadence is optional.
	}
}

export async function connectTrainerDevice(
	device: BluetoothDevice,
	rediscover: boolean,
	fallbackRange: Range,
	{ onControlRejected, onDisconnect, onMetrics }: TrainerDeviceCallbacks
): Promise<TrainerDeviceConnection> {
	const server = await connectGatt(device, rediscover);
	const service = await server.getPrimaryService(FITNESS_MACHINE);
	const bikeData = await service.getCharacteristic(INDOOR_BIKE_DATA);
	const removeBikeData = await startBluetoothNotifications(bikeData, (event) => {
		const value = characteristicValue(event);
		if (!value) {
			return;
		}
		const parsed = parseIndoorBikeData(value);
		onMetrics(parsed.metrics, parsed.reportsDistance);
	});
	try {
		const controlPoint = await service.getCharacteristic(CONTROL_POINT);
		const removeControlPoint = await startBluetoothNotifications(controlPoint, (event) => {
			const value = characteristicValue(event);
			if (value?.getUint8(0) === 0x80 && value.getUint8(2) !== 0x01) {
				onControlRejected();
			}
		});
		try {
			await (await service.getCharacteristic(FITNESS_MACHINE_STATUS)).startNotifications();
		} catch {
			// Optional characteristic.
		}
		let resistanceRange = fallbackRange;
		try {
			const rangeValue = await (
				await service.getCharacteristic(SUPPORTED_RESISTANCE_LEVEL_RANGE)
			).readValue();
			resistanceRange = {
				max: rangeValue.getInt16(2, true) / 10,
				min: rangeValue.getInt16(0, true) / 10,
			};
		} catch {
			// Use the generic range.
		}
		device.addEventListener('gattserverdisconnected', onDisconnect, { once: true });
		const optionalCleanups: Array<() => void> = [];
		let cleanedUp = false;
		const cleanupRequiredServices = combineBluetoothCleanups(
			removeBikeData,
			removeControlPoint,
			() => device.removeEventListener('gattserverdisconnected', onDisconnect)
		);
		const cleanup = () => {
			if (cleanedUp) {
				return;
			}
			cleanedUp = true;
			cleanupRequiredServices();
			combineBluetoothCleanups(...optionalCleanups)();
			optionalCleanups.length = 0;
		};
		Promise.all([
			optionalPowerSubscription(server, onMetrics),
			optionalCadenceSubscription(server, onMetrics),
		]).then((cleanups) => {
			if (cleanedUp) {
				combineBluetoothCleanups(...cleanups)();
				return;
			}
			for (const optionalCleanup of cleanups) {
				if (optionalCleanup) {
					optionalCleanups.push(optionalCleanup);
				}
			}
		});
		return {
			cleanup,
			controlPoint,
			resistanceRange,
		};
	} catch (error) {
		combineBluetoothCleanups(removeBikeData, () =>
			device.removeEventListener('gattserverdisconnected', onDisconnect)
		)();
		throw error;
	}
}
