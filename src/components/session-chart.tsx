import { useSelector } from '@tanstack/react-store';
import { Fragment, useCallback, useEffect, useMemo } from 'react';
import { evenlySample, valueRange } from '../lib/arrays';
import { chartPath, roundedChartMaximum } from '../lib/chart';
import { CHART_MODE } from '../lib/chart-mode';
import { CONTROL_MODE } from '../lib/control-mode';
import { eventTargetsEditableControl, keyboardEventHasModifiers } from '../lib/dom';
import { formatChartSeconds } from '../lib/format';
import { MAX_GEAR, MIN_GEAR } from '../lib/gears';
import {
	ELEVATION_METRIC_PRESENTATION,
	GEAR_METRIC_PRESENTATION,
	GRADE_METRIC_PRESENTATION,
	METRIC_PRESENTATION,
	RESISTANCE_METRIC_PRESENTATION,
	STANDARD_METRIC_KEYS,
} from '../lib/metric-presentation';
import { MAX_RESISTANCE, MIN_RESISTANCE } from '../lib/resistance';
import {
	convertElevation,
	convertSpeed,
	elevationUnitLabel,
	minimumSpeedChartMaximum,
	speedUnitLabel,
} from '../lib/units';
import { preferencesStore } from '../stores/preferences-store';
import type { ChartMode, ControlMode, MetricSample, RoutePoint, SpeedUnit } from '../types';

const MAXIMUM_RENDERED_CHART_SAMPLES = 2000;

function maximumValue<T>(values: readonly T[], numericValue: (value: T) => number): number {
	return values.reduce((maximum, value) => Math.max(maximum, numericValue(value)), 0);
}

interface PlotProps {
	color: string;
	decimals: number;
	heightClass: string;
	maximum: number;
	minimum?: number;
	positions: number[];
	title: string;
	unit: string;
	values: (number | undefined)[];
}

export function ChartPlot({
	color,
	decimals,
	heightClass,
	maximum,
	minimum = 0,
	positions,
	title,
	unit,
	values,
}: PlotProps) {
	const labels = [maximum, (maximum + minimum) / 2, minimum];
	const labelPositions = [14, 52, 90];
	return (
		<div className={`flex w-full ${heightClass}`}>
			<div className="pointer-events-none relative h-full w-15 shrink-0 font-medium text-[10px] text-slate-400">
				{labels.map((label, index) => (
					<span
						className="absolute right-2 -translate-y-1/2 whitespace-nowrap"
						key={label}
						style={{ top: `${labelPositions[index]}%` }}
					>
						{label.toFixed(decimals)} {unit}
					</span>
				))}
			</div>
			<div className="h-full min-w-0 flex-1 overflow-hidden">
				<svg
					className="block h-full w-full"
					preserveAspectRatio="none"
					viewBox="0 0 100 100"
				>
					<title>{title}</title>
					<path
						d="M0 14H100 M0 90H100"
						fill="none"
						stroke="#3a4654"
						strokeWidth=".75"
						vectorEffect="non-scaling-stroke"
					/>
					<path
						d="M0 52H100 M25 14V90 M50 14V90 M75 14V90"
						fill="none"
						stroke="#3a4654"
						strokeDasharray="2.5 2.5"
						strokeWidth=".75"
						vectorEffect="non-scaling-stroke"
					/>
					<path
						d={chartPath(values, minimum, maximum, positions)}
						fill="none"
						stroke={color}
						strokeWidth="1.5"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
			</div>
		</div>
	);
}

export function SessionChart({
	controlMode,
	history,
	keyboardEnabled = true,
	onSelectChartMode,
	route,
	selectedChartMode,
	speedUnit,
}: {
	controlMode?: ControlMode;
	history: MetricSample[];
	keyboardEnabled?: boolean;
	onSelectChartMode?: (mode: ChartMode) => void;
	route: readonly RoutePoint[];
	selectedChartMode?: ChartMode;
	speedUnit: SpeedUnit;
}) {
	const preferredChartMode = useSelector(
		preferencesStore,
		(preferences) => preferences.chartMode
	);
	const selectedMode = selectedChartMode ?? preferredChartMode;
	const resolvedControlMode =
		controlMode ??
		(history.some((sample) => sample.gear !== undefined)
			? CONTROL_MODE.GEAR
			: CONTROL_MODE.RESISTANCE);
	const chartHistory = useMemo(
		() => evenlySample(history, MAXIMUM_RENDERED_CHART_SAMPLES),
		[history]
	);
	const series = useMemo(() => {
		const speedValues = chartHistory.map((sample) => convertSpeed(sample.speed, speedUnit));
		const routeElevations = route.map((point) => convertElevation(point.elevation, speedUnit));
		const routeElevationRange = valueRange(routeElevations, (elevation) => elevation);
		const gradeValues = chartHistory.map((sample) => sample.grade);
		const hasRecordedGear = history.some((sample) => sample.gear !== undefined);
		const standardSeries = STANDARD_METRIC_KEYS.map((key) => {
			const presentation = METRIC_PRESENTATION[key];
			const values = chartHistory.map((sample) => sample[key]);
			return {
				chartMaximum: roundedChartMaximum(
					maximumValue(values, (value) => value ?? 0),
					presentation.chartMinimumMaximum,
					presentation.chartStep
				),
				color: presentation.chartColor,
				decimals: 0,
				key,
				label: presentation.label,
				minimum: 0,
				unit: presentation.unit,
				values,
			};
		});
		const controlSeries = [
			...(resolvedControlMode === CONTROL_MODE.GEAR || hasRecordedGear
				? [
						{
							chartMaximum: MAX_GEAR,
							color: GEAR_METRIC_PRESENTATION.chartColor,
							decimals: 0,
							key: CONTROL_MODE.GEAR,
							label: GEAR_METRIC_PRESENTATION.label,
							minimum: MIN_GEAR,
							unit: '',
							values: chartHistory.map((sample) => sample.gear),
						},
					]
				: []),
			{
				chartMaximum: MAX_RESISTANCE,
				color: RESISTANCE_METRIC_PRESENTATION.chartColor,
				decimals: 0,
				key: CONTROL_MODE.RESISTANCE,
				label: RESISTANCE_METRIC_PRESENTATION.label,
				minimum: MIN_RESISTANCE,
				unit: RESISTANCE_METRIC_PRESENTATION.unit,
				values: chartHistory.map((sample) => sample.resistance),
			},
		];
		const maximumAbsoluteGrade = maximumValue(gradeValues, (grade) => Math.abs(grade ?? 0));
		const gradeMaximum = roundedChartMaximum(maximumAbsoluteGrade, 5, 5);
		const gradeSeries = gradeValues.some((grade) => grade !== undefined)
			? [
					{
						chartMaximum: gradeMaximum,
						color: GRADE_METRIC_PRESENTATION.chartColor,
						decimals: 1,
						key: CHART_MODE.GRADE,
						label: GRADE_METRIC_PRESENTATION.label,
						minimum: -gradeMaximum,
						unit: GRADE_METRIC_PRESENTATION.unit,
						values: gradeValues,
					},
				]
			: [];
		const elevationSeries = routeElevationRange
			? [
					{
						chartMaximum: routeElevationRange.maximum,
						color: ELEVATION_METRIC_PRESENTATION.chartColor,
						decimals: 0,
						key: CHART_MODE.ELEVATION,
						label: ELEVATION_METRIC_PRESENTATION.label,
						minimum: routeElevationRange.minimum,
						unit: elevationUnitLabel(speedUnit),
						values: chartHistory.map((sample) =>
							sample.elevation === undefined
								? undefined
								: convertElevation(sample.elevation, speedUnit)
						),
					},
				]
			: [];
		return [
			{
				chartMaximum: roundedChartMaximum(
					maximumValue(speedValues, (speed) => speed),
					minimumSpeedChartMaximum(speedUnit),
					5
				),
				color: METRIC_PRESENTATION.speed.chartColor,
				decimals: 1,
				key: CHART_MODE.SPEED,
				label: METRIC_PRESENTATION.speed.label,
				minimum: 0,
				unit: speedUnitLabel(speedUnit),
				values: speedValues,
			},
			...standardSeries,
			...controlSeries,
			...gradeSeries,
			...elevationSeries,
		];
	}, [chartHistory, history, resolvedControlMode, route, speedUnit]);
	const effectiveMode =
		selectedMode === CHART_MODE.ALL || series.some((item) => item.key === selectedMode)
			? selectedMode
			: CHART_MODE.ALL;
	const visibleSeries =
		effectiveMode === CHART_MODE.ALL
			? series
			: series.filter((item) => item.key === effectiveMode);
	const availableModes = useMemo(
		() => [
			{ label: 'All', value: CHART_MODE.ALL },
			...series.map(({ key, label }) => ({ label, value: key })),
		],
		[series]
	);
	const historyPositions = chartHistory.map((sample) => sample.elapsedSeconds);
	const historyStart = chartHistory.at(0)?.elapsedSeconds ?? 0;
	const historySeconds =
		chartHistory.length > 1 ? (chartHistory.at(-1)?.elapsedSeconds ?? 0) - historyStart : 0;

	const selectMode = useCallback(
		(mode: ChartMode) => (onSelectChartMode ?? preferencesStore.actions.selectChartMode)(mode),
		[onSelectChartMode]
	);

	useEffect(() => {
		if (!keyboardEnabled) {
			return;
		}
		const handleKeys = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				keyboardEventHasModifiers(event) ||
				eventTargetsEditableControl(event) ||
				!['ArrowLeft', 'ArrowRight'].includes(event.key)
			) {
				return;
			}
			event.preventDefault();
			const current = Math.max(
				0,
				availableModes.findIndex((mode) => mode.value === effectiveMode)
			);
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			selectMode(
				availableModes[
					(current + direction + availableModes.length) % availableModes.length
				].value
			);
		};
		window.addEventListener('keydown', handleKeys);
		return () => window.removeEventListener('keydown', handleKeys);
	}, [availableModes, effectiveMode, keyboardEnabled, selectMode]);

	return (
		<div className="mt-6 overflow-hidden rounded-xl border border-line bg-[#12171d] p-4">
			<div className="flex w-full gap-1 overflow-x-auto rounded-lg bg-[#0d1217] p-1">
				{availableModes.map((mode) => (
					<button
						className={`inline-flex min-w-max flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-2 font-semibold text-[13px] transition ${effectiveMode === mode.value ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-200'}`}
						key={mode.value}
						onClick={() => selectMode(mode.value)}
						type="button"
					>
						{mode.value === CHART_MODE.ALL ? null : (
							<span
								className="h-1.5 w-1.5 shrink-0 rounded-full"
								style={{
									backgroundColor:
										series.find((item) => item.key === mode.value)?.color ??
										'#adf5bd',
								}}
							/>
						)}
						{mode.label}
					</button>
				))}
			</div>
			<div className="mt-4">
				<div className="relative w-full">
					{history.length === 0 ? (
						<div className="absolute inset-0 z-20 grid place-items-center px-4 text-center text-slate-500 text-sm">
							Connect and pedal to graph live session data
						</div>
					) : null}
					{visibleSeries.map((item, index) => (
						<Fragment key={item.key}>
							<ChartPlot
								color={item.color}
								decimals={item.decimals}
								heightClass={effectiveMode === CHART_MODE.ALL ? 'h-24' : 'h-52'}
								maximum={item.chartMaximum}
								minimum={item.minimum}
								positions={historyPositions}
								title={`${item.label} over time`}
								unit={item.unit}
								values={item.values}
							/>
							{effectiveMode === CHART_MODE.ALL &&
							index < visibleSeries.length - 1 ? (
								<div
									aria-hidden="true"
									className="pointer-events-none relative -my-3 ml-15 h-6 bg-white/1.5"
									data-chart-separator="true"
								/>
							) : null}
						</Fragment>
					))}
				</div>
				<div className="mt-1 grid grid-cols-[3.75rem_minmax(0,1fr)] text-[10px] text-slate-500">
					<span aria-hidden="true" />
					<div className="flex justify-between">
						{[0, 0.25, 0.5, 0.75, 1].map((position) => (
							<span key={position}>
								{formatChartSeconds(historyStart + historySeconds * position)}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
