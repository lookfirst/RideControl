import { CONTROL_MODE } from './control-mode';

export const CHART_MODE = {
	ALL: 'all',
	CADENCE: 'cadence',
	ELEVATION: 'elevation',
	GEAR: CONTROL_MODE.GEAR,
	HEART_RATE: 'heartRate',
	POWER: 'power',
	RESISTANCE: CONTROL_MODE.RESISTANCE,
	SPEED: 'speed',
} as const;

export type ChartMode = (typeof CHART_MODE)[keyof typeof CHART_MODE];

const PERSISTED_CHART_MODES = new Set<unknown>([
	CHART_MODE.ALL,
	CHART_MODE.SPEED,
	CHART_MODE.POWER,
	CHART_MODE.CADENCE,
	CHART_MODE.HEART_RATE,
	CHART_MODE.GEAR,
	CHART_MODE.RESISTANCE,
]);

export function isPersistedChartMode(value: unknown): value is ChartMode {
	return PERSISTED_CHART_MODES.has(value);
}
