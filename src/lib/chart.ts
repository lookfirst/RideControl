import type { ChartMode } from '../types';
import { CONTROL_MODE, type ControlMode } from './control-mode';
import { METRIC_PRESENTATION, STANDARD_METRIC_KEYS } from './metric-presentation';
import { clamp } from './numbers';

export const CHART_MODE_STORAGE_KEY = 'trainer-chart-mode';

const baseChartModes: { label: string; value: ChartMode }[] = [
	{ label: 'All', value: 'all' },
	{ label: METRIC_PRESENTATION.speed.label, value: 'speed' },
	...STANDARD_METRIC_KEYS.map((key) => ({
		label: METRIC_PRESENTATION[key].label,
		value: key,
	})),
];

export function chartModesForControl(controlMode: ControlMode) {
	return [
		...baseChartModes,
		controlMode === CONTROL_MODE.GEAR
			? { label: 'Gear', value: CONTROL_MODE.GEAR }
			: { label: 'Resistance', value: CONTROL_MODE.RESISTANCE },
	];
}

export function storedChartMode(storage: Pick<Storage, 'getItem'> = localStorage): ChartMode {
	const saved = storage.getItem(CHART_MODE_STORAGE_KEY);
	return [
		'all',
		'speed',
		'power',
		'cadence',
		'heartRate',
		CONTROL_MODE.GEAR,
		CONTROL_MODE.RESISTANCE,
	].includes(saved ?? '')
		? (saved as ChartMode)
		: 'all';
}

export function chartPath(
	values: (number | undefined)[],
	minimum: number,
	maximum: number,
	positions?: number[]
): string {
	if (values.length === 0) {
		return '';
	}
	const span = maximum - minimum || 1;
	const firstPosition = positions?.[0] ?? 0;
	const positionSpan = (positions?.at(-1) ?? 0) - firstPosition;
	let drawing = false;
	return values
		.map((value, index) => {
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				drawing = false;
				return '';
			}
			let x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
			if (positions && positionSpan > 0) {
				x = (((positions[index] ?? firstPosition) - firstPosition) / positionSpan) * 100;
			}
			const normalized = clamp((value - minimum) / span, 0, 1);
			const y = 90 - normalized * 76;
			const command = drawing ? 'L' : 'M';
			drawing = true;
			return `${command} ${x} ${y}`;
		})
		.filter(Boolean)
		.join(' ');
}

export function roundedChartMaximum(value: number, minimum: number, step: number) {
	return Math.max(minimum, Math.ceil(value / step) * step);
}
