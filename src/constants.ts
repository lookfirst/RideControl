import { CONTROL_MODE } from './lib/control-mode';
import type { ElevationTotals, Metrics, StoredSession } from './types';

export const FITNESS_MACHINE = 0x18_26;
export const CYCLING_POWER = 0x18_18;
export const CYCLING_SPEED_AND_CADENCE = 0x18_16;
export const HEART_RATE = 0x18_0d;
export const BATTERY = 0x18_0f;
export const DEVICE_INFORMATION = 0x18_0a;
export const INDOOR_BIKE_DATA = 0x2a_d2;
export const CONTROL_POINT = 0x2a_d9;
export const FITNESS_MACHINE_STATUS = 0x2a_da;
export const SUPPORTED_RESISTANCE_LEVEL_RANGE = 0x2a_d6;
export const CYCLING_POWER_MEASUREMENT = 0x2a_63;
export const CSC_MEASUREMENT = 0x2a_5b;
export const CHROME_BLUETOOTH_FLAGS_URL =
	'chrome://flags/#enable-web-bluetooth-new-permissions-backend';
export const CHROME_BLUETOOTH_PERMISSION_MESSAGE = 'Chrome returned no site-authorized.';
export const WEB_BLUETOOTH_UNAVAILABLE_MESSAGE =
	'Web Bluetooth requires current Chrome or Edge on localhost or HTTPS.';
export const BLUETOOTH_GATT_CONNECTION_TIMEOUT_MS = 30_000;
export const BLUETOOTH_OPERATION_TIMEOUT_MS = 5000;
export const OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS = 1000;
export const RECORDING_PAUSE_DELAY_MS = 10_000;
export const CONTROL_FLASH_MS = 180;
export const EMPTY_ROUTE = [] as const;

export const TRAINER_OPTIONAL_SERVICES: BluetoothServiceUUID[] = [
	CYCLING_POWER,
	CYCLING_SPEED_AND_CADENCE,
	BATTERY,
	DEVICE_INFORMATION,
];

export const FTMS_CONTROL_OPCODE = {
	REQUEST_CONTROL: 0x00,
	RESPONSE_CODE: 0x80,
	SET_TARGET_RESISTANCE: 0x04,
	START_OR_RESUME: 0x07,
} as const;

export const emptyMetrics: Metrics = {
	cadence: 0,
	calories: 0,
	distance: 0,
	heartRate: 0,
	power: 0,
	speed: 0,
};

export const emptyElevationTotals: ElevationTotals = {
	ascent: 0,
	descent: 0,
};

export const emptySession: StoredSession = {
	aggregates: {
		cadence: { count: 0, sum: 0 },
		gear: { count: 0, sum: 0 },
		heartRate: { count: 0, sum: 0 },
		power: { count: 0, sum: 0 },
		resistance: { count: 0, sum: 0 },
	},
	calories: 0,
	controlMode: CONTROL_MODE.RESISTANCE,
	discarded: false,
	distance: 0,
	elapsedSeconds: 0,
	elevationTotals: emptyElevationTotals,
	ended: false,
	endedAt: 0,
	history: [],
	maximums: emptyMetrics,
	startedAt: 0,
};
