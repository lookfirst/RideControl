import {
	CONTROL_POINT,
	CSC_MEASUREMENT,
	CYCLING_POWER,
	CYCLING_POWER_MEASUREMENT,
	CYCLING_SPEED_AND_CADENCE,
	FITNESS_MACHINE,
	FTMS_CONTROL_OPCODE,
	INDOOR_BIKE_DATA,
	OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
	SUPPORTED_RESISTANCE_LEVEL_RANGE,
	TRAINER_OPTIONAL_SERVICES,
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
	onDisconnect: () => void;
	onMetrics: (metrics: Partial<Metrics>, reportsDistance: boolean) => void;
}

export interface TrainerDeviceConnection {
	cleanup: () => void;
	resistanceRange: Range;
	sendControlCommand: (bytes: readonly number[]) => Promise<void>;
	startOptionalMetrics: () => void;
}

interface PendingControlProcedure {
	opcode: number;
	reject: (error: Error) => void;
	resolve: () => void;
}

const FTMS_RESULT = {
	CONTROL_NOT_PERMITTED: 0x05,
	INVALID_PARAMETER: 0x03,
	OP_CODE_NOT_SUPPORTED: 0x02,
	OPERATION_FAILED: 0x04,
	SUCCESS: 0x01,
} as const;

const FTMS_RESULT_MESSAGE: Readonly<Record<number, string>> = {
	[FTMS_RESULT.CONTROL_NOT_PERMITTED]: 'control not permitted',
	[FTMS_RESULT.INVALID_PARAMETER]: 'invalid parameter',
	[FTMS_RESULT.OP_CODE_NOT_SUPPORTED]: 'operation not supported',
	[FTMS_RESULT.OPERATION_FAILED]: 'operation failed',
};

const FTMS_COMMAND_NAME: Readonly<Record<number, string>> = {
	[FTMS_CONTROL_OPCODE.REQUEST_CONTROL]: 'Request Control',
	[FTMS_CONTROL_OPCODE.SET_TARGET_RESISTANCE]: 'Set Target Resistance',
	[FTMS_CONTROL_OPCODE.START_OR_RESUME]: 'Start or Resume',
};

export function trainerRequestOptions(): RequestDeviceOptions {
	return {
		filters: [{ services: [FITNESS_MACHINE] }],
		optionalServices: TRAINER_OPTIONAL_SERVICES,
	};
}

function ftmsControlError(opcode: number, result: number): Error {
	const command = FTMS_COMMAND_NAME[opcode] ?? `command 0x${opcode.toString(16)}`;
	const resultMessage = FTMS_RESULT_MESSAGE[result] ?? `result 0x${result.toString(16)}`;
	return new Error(`Trainer rejected ${command}: ${resultMessage}.`);
}

function createControlPointProcedure(controlPoint: BluetoothRemoteGATTCharacteristic): {
	cancel: () => void;
	handleIndication: (event: Event) => void;
	send: (bytes: readonly number[]) => Promise<void>;
} {
	let pending: PendingControlProcedure | undefined;
	const handleIndication = (event: Event) => {
		const value = characteristicValue(event);
		if (
			!(pending && value) ||
			value.byteLength < 3 ||
			value.getUint8(0) !== FTMS_CONTROL_OPCODE.RESPONSE_CODE ||
			value.getUint8(1) !== pending.opcode
		) {
			return;
		}
		const procedure = pending;
		pending = undefined;
		const result = value.getUint8(2);
		if (result === FTMS_RESULT.SUCCESS) {
			procedure.resolve();
		} else {
			procedure.reject(ftmsControlError(procedure.opcode, result));
		}
	};
	const cancel = () => {
		const procedure = pending;
		pending = undefined;
		procedure?.reject(new Error('Trainer connection closed during a control command.'));
	};
	const send = async (bytes: readonly number[]) => {
		const [opcode] = bytes;
		if (opcode === undefined) {
			throw new Error('Trainer control command cannot be empty.');
		}
		if (pending) {
			throw new Error('Another trainer control command is still in progress.');
		}
		let procedure: PendingControlProcedure | undefined;
		const response = new Promise<void>((resolve, reject) => {
			procedure = { opcode, reject, resolve };
			pending = procedure;
		});
		const acknowledged = withBluetoothOperationTimeout(
			response,
			'Fitness machine control response'
		);
		try {
			await Promise.all([
				withBluetoothOperationTimeout(
					controlPoint.writeValueWithResponse(Uint8Array.from(bytes)),
					'Fitness machine control write'
				),
				acknowledged,
			]);
		} catch (error) {
			if (pending === procedure) {
				pending = undefined;
			}
			throw error;
		}
	};
	return { cancel, handleIndication, send };
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
	{ onDisconnect, onMetrics }: TrainerDeviceCallbacks
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
	const controlProcedure = createControlPointProcedure(controlPoint);
	const controlPointNotifications = createBluetoothNotificationSubscription(
		controlPoint,
		controlProcedure.handleIndication
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
			controlProcedure.cancel,
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
			resistanceRange,
			sendControlCommand: controlProcedure.send,
			startOptionalMetrics,
		};
	} catch (error) {
		combineBluetoothCleanups(
			bikeDataNotifications.cleanup,
			controlPointNotifications.cleanup,
			controlProcedure.cancel,
			() => device.removeEventListener('gattserverdisconnected', onDisconnect)
		)();
		throw error;
	}
}
