import { useSelector } from '@tanstack/react-store';
import { Fragment, useCallback, useEffect, useMemo } from 'react';
import { chartModesForControl, chartPath, roundedChartMaximum } from '../lib/chart';
import { CONTROL_MODE, isControlMode } from '../lib/control-mode';
import { eventTargetsEditableControl, keyboardEventHasModifiers } from '../lib/dom';
import { formatChartSeconds } from '../lib/format';
import { MAX_GEAR, MIN_GEAR } from '../lib/gears';
import { METRIC_PRESENTATION, STANDARD_METRIC_KEYS } from '../lib/metric-presentation';
import { MAX_RESISTANCE, MIN_RESISTANCE } from '../lib/resistance';
import { convertSpeed, minimumSpeedChartMaximum, speedUnitLabel } from '../lib/units';
import { preferencesStore } from '../stores/preferences-store';
import type { ChartMode, ControlMode, MetricSample, RoutePoint, SpeedUnit } from '../types';

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
	route,
	speedUnit,
}: {
	controlMode?: ControlMode;
	history: MetricSample[];
	keyboardEnabled?: boolean;
	route: readonly RoutePoint[];
	speedUnit: SpeedUnit;
}) {
	const selectedMode = useSelector(preferencesStore, (preferences) => preferences.chartMode);
	const resolvedControlMode =
		controlMode ??
		(history.some((sample) => sample.gear !== undefined)
			? CONTROL_MODE.GEAR
			: CONTROL_MODE.RESISTANCE);
	const modeForAvailableControl = isControlMode(selectedMode)
		? resolvedControlMode
		: selectedMode;
	const effectiveMode =
		modeForAvailableControl === 'elevation' && route.length === 0
			? 'all'
			: modeForAvailableControl;
	const series = useMemo(() => {
		const speedValues = history.map((sample) => convertSpeed(sample.speed, speedUnit));
		const standardSeries = STANDARD_METRIC_KEYS.map((key) => {
			const presentation = METRIC_PRESENTATION[key];
			const values = history.map((sample) => sample[key]);
			return {
				chartMaximum: roundedChartMaximum(
					Math.max(...values, 0),
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
		const controlSeries =
			resolvedControlMode === CONTROL_MODE.GEAR
				? {
						chartMaximum: MAX_GEAR,
						color: '#adf5bd',
						decimals: 0,
						key: CONTROL_MODE.GEAR,
						label: 'Gear',
						minimum: MIN_GEAR,
						unit: '',
						values: history.map((sample) => sample.gear),
					}
				: {
						chartMaximum: MAX_RESISTANCE,
						color: '#adf5bd',
						decimals: 0,
						key: CONTROL_MODE.RESISTANCE,
						label: 'Resistance',
						minimum: MIN_RESISTANCE,
						unit: '%',
						values: history.map((sample) => sample.resistance),
					};
		return [
			{
				chartMaximum: roundedChartMaximum(
					Math.max(...speedValues, 0),
					minimumSpeedChartMaximum(speedUnit),
					5
				),
				color: METRIC_PRESENTATION.speed.chartColor,
				decimals: 1,
				key: 'speed' as const,
				label: METRIC_PRESENTATION.speed.label,
				minimum: 0,
				unit: speedUnitLabel(speedUnit),
				values: speedValues,
			},
			...standardSeries,
			controlSeries,
		];
	}, [history, resolvedControlMode, speedUnit]);
	const visibleSeries =
		effectiveMode === 'all' ? series : series.filter((item) => item.key === effectiveMode);
	const availableModes = useMemo(
		() =>
			route.length
				? [
						...chartModesForControl(resolvedControlMode),
						{ label: 'Elevation', value: 'elevation' as const },
					]
				: chartModesForControl(resolvedControlMode),
		[resolvedControlMode, route.length]
	);
	const elevationValues = route.map((point) => point.elevation);
	const elevationMinimum = elevationValues.length ? Math.min(...elevationValues) : 0;
	const elevationMaximum = elevationValues.length ? Math.max(...elevationValues) : 1;
	const historyPositions = history.map((sample) => sample.elapsedSeconds);
	const historyStart = history[0]?.elapsedSeconds ?? 0;
	const historySeconds =
		history.length > 1 ? (history.at(-1)?.elapsedSeconds ?? 0) - historyStart : 0;

	const selectMode = useCallback(
		(mode: ChartMode) => preferencesStore.actions.selectChartMode(mode),
		[]
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
			<div className="flex flex-wrap items-center justify-end gap-3">
				<div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-[#0d1217] p-1">
					{availableModes.map((mode) => (
						<button
							className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 font-semibold text-[11px] transition ${effectiveMode === mode.value ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-200'}`}
							key={mode.value}
							onClick={() => selectMode(mode.value)}
							type="button"
						>
							{mode.value === 'all' ? null : (
								<span
									className="h-2 w-2 rounded-full"
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
			</div>
			<div className="mt-4">
				<div className="relative w-full">
					{(effectiveMode === 'elevation' ? route.length : history.length) === 0 ? (
						<div className="absolute inset-0 z-20 grid place-items-center px-4 text-center text-slate-500 text-sm">
							Connect and pedal to graph live session data
						</div>
					) : null}
					{effectiveMode === 'elevation' ? (
						<ChartPlot
							color="#adf5bd"
							decimals={0}
							heightClass="h-52"
							maximum={elevationMaximum}
							minimum={elevationMinimum}
							positions={route.map((point) => point.distance)}
							title="Route elevation"
							unit="m"
							values={elevationValues}
						/>
					) : (
						visibleSeries.map((item, index) => (
							<Fragment key={item.key}>
								<ChartPlot
									color={item.color}
									decimals={item.decimals}
									heightClass={effectiveMode === 'all' ? 'h-24' : 'h-52'}
									maximum={item.chartMaximum}
									minimum={item.minimum}
									positions={historyPositions}
									title={`${item.label} over time`}
									unit={item.unit}
									values={item.values}
								/>
								{effectiveMode === 'all' && index < visibleSeries.length - 1 ? (
									<div
										aria-hidden="true"
										className="pointer-events-none relative -my-3 ml-15 h-6 bg-white/1.5"
										data-chart-separator="true"
									/>
								) : null}
							</Fragment>
						))
					)}
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
