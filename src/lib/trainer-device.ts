import {
	CONTROL_POINT,
	CSC_MEASUREMENT,
	CYCLING_POWER,
	CYCLING_POWER_MEASUREMENT,
	CYCLING_SPEED_AND_CADENCE,
	FITNESS_MACHINE,
	INDOOR_BIKE_DATA,
	OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
	SUPPORTED_RESISTANCE_LEVEL_RANGE,
} from '../constants';
import type { Metrics, Range } from '../types';
import {
	characteristicValue,
	connectGatt,
	parseCrankCadence,
	parseIndoorBikeData,
} from './bluetooth';
import {
	combineBluetoothCleanups,
	createBluetoothNotificationSubscription,
	startBluetoothNotifications,
} from './bluetooth-notifications';
import { withBluetoothOperationTimeout } from './bluetooth-operation';
import { withPromiseTimeout } from './promise-timeout';

interface TrainerDeviceCallbacks {
	onControlRejected: () => void;
	onDisconnect: () => void;
	onMetrics: (metrics: Partial<Metrics>, reportsDistance: boolean) => void;
}

export interface TrainerDeviceConnection {
	cleanup: () => void;
	controlPoint: BluetoothRemoteGATTCharacteristic;
	resistanceRange: Range;
	startOptionalMetrics: () => void;
}

async function readResistanceRange(service: BluetoothRemoteGATTService) {
	return (await service.getCharacteristic(SUPPORTED_RESISTANCE_LEVEL_RANGE)).readValue();
}

async function optionalPowerSubscription(
	server: BluetoothRemoteGATTServer,
	onMetrics: TrainerDeviceCallbacks['onMetrics']
) {
	try {
		const service = await withPromiseTimeout(
			server.getPrimaryService(CYCLING_POWER),
			OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
			() => new Error('Cycling power service unavailable.')
		);
		const measurement = await withPromiseTimeout(
			service.getCharacteristic(CYCLING_POWER_MEASUREMENT),
			OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
			() => new Error('Cycling power measurement unavailable.')
		);
		return await startBluetoothNotifications(
			measurement,
			(event) => {
				const value = characteristicValue(event);
				if (value) {
					onMetrics({ power: value.getInt16(2, true) }, false);
				}
			},
			OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS
		);
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
		const service = await withPromiseTimeout(
			server.getPrimaryService(CYCLING_SPEED_AND_CADENCE),
			OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
			() => new Error('Cycling cadence service unavailable.')
		);
		const measurement = await withPromiseTimeout(
			service.getCharacteristic(CSC_MEASUREMENT),
			OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
			() => new Error('Cycling cadence measurement unavailable.')
		);
		return await startBluetoothNotifications(
			measurement,
			(event) => {
				const value = characteristicValue(event);
				if (!value) {
					return;
				}
				const parsed = parseCrankCadence(value, previousCrank);
				previousCrank = parsed.current ?? previousCrank;
				if (parsed.cadence !== undefined) {
					onMetrics({ cadence: parsed.cadence }, false);
				}
			},
			OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS
		);
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
	const service = await withBluetoothOperationTimeout(
		server.getPrimaryService(FITNESS_MACHINE),
		'Fitness machine service discovery'
	);
	// ATT requests share one channel on a device. Keep this setup sequential even
	// while connections to other physical devices proceed in parallel.
	const bikeData = await withBluetoothOperationTimeout(
		service.getCharacteristic(INDOOR_BIKE_DATA),
		'Indoor bike data discovery'
	);
	const controlPoint = await withBluetoothOperationTimeout(
		service.getCharacteristic(CONTROL_POINT),
		'Fitness machine control discovery'
	);
	const bikeDataNotifications = createBluetoothNotificationSubscription(bikeData, (event) => {
		const value = characteristicValue(event);
		if (!value) {
			return;
		}
		const parsed = parseIndoorBikeData(value);
		onMetrics(parsed.metrics, parsed.reportsDistance);
	});
	const controlPointNotifications = createBluetoothNotificationSubscription(
		controlPoint,
		(event) => {
			const value = characteristicValue(event);
			if (value?.getUint8(0) === 0x80 && value.getUint8(2) !== 0x01) {
				onControlRejected();
			}
		}
	);
	try {
		await withBluetoothOperationTimeout(
			bikeDataNotifications.start(),
			'Indoor bike data notification setup'
		);
		await withBluetoothOperationTimeout(
			controlPointNotifications.start(),
			'Fitness machine control notification setup'
		);
		let resistanceRange = fallbackRange;
		try {
			const rangeValue = await withPromiseTimeout(
				readResistanceRange(service),
				OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
				() => new Error('Resistance range unavailable.')
			);
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
		let optionalMetricsStarted = false;
		const cleanupRequiredServices = combineBluetoothCleanups(
			bikeDataNotifications.cleanup,
			controlPointNotifications.cleanup,
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
		const startOptionalMetrics = () => {
			if (optionalMetricsStarted) {
				return;
			}
			optionalMetricsStarted = true;
			(async () => {
				const cleanups = [
					await optionalPowerSubscription(server, onMetrics),
					await optionalCadenceSubscription(server, onMetrics),
				];
				if (cleanedUp) {
					combineBluetoothCleanups(...cleanups)();
					return;
				}
				for (const optionalCleanup of cleanups) {
					if (optionalCleanup) {
						optionalCleanups.push(optionalCleanup);
					}
				}
			})().catch(() => undefined);
		};
		return {
			cleanup,
			controlPoint,
			resistanceRange,
			startOptionalMetrics,
		};
	} catch (error) {
		combineBluetoothCleanups(
			bikeDataNotifications.cleanup,
			controlPointNotifications.cleanup,
			() => device.removeEventListener('gattserverdisconnected', onDisconnect)
		)();
		throw error;
	}
}
