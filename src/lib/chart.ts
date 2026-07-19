import type { ChartMode, ControlMode } from '../types';

const baseChartModes: { label: string; value: ChartMode }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Speed', value: 'speed' },
	{ label: 'Power', value: 'power' },
	{ label: 'Cadence', value: 'cadence' },
	{ label: 'Heart rate', value: 'heartRate' },
];

export function chartModesForControl(controlMode: ControlMode) {
	return [
		...baseChartModes,
		controlMode === 'gear'
			? { label: 'Gear', value: 'gear' as const }
			: { label: 'Resistance', value: 'resistance' as const },
	];
}

export function storedChartMode(storage: Pick<Storage, 'getItem'> = localStorage): ChartMode {
	const saved = storage.getItem('trainer-chart-mode');
	return ['all', 'speed', 'power', 'cadence', 'heartRate', 'gear', 'resistance'].includes(
		saved ?? ''
	)
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
			const normalized = Math.max(0, Math.min(1, (value - minimum) / span));
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
