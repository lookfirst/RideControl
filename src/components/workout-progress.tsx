import { formatGrade } from '../lib/format';
import {
	GRADE_METRIC_PRESENTATION,
	RESISTANCE_METRIC_PRESENTATION,
} from '../lib/metric-presentation';
import { formatDistanceProgress, formatElevation } from '../lib/units';
import { WORKOUT_ROUTE_TYPE, WORKOUT_VIEW, type WorkoutRouteType } from '../lib/workout-schema';
import type { ElevationTotals, SessionWorkout, SpeedUnit, WorkoutTerrain } from '../types';
import { WorkoutRouteVisualization } from './workout-route-visualization';

interface WorkoutStat {
	color?: string;
	label: string;
	value: string;
	valueClassName?: string;
}

const WORKOUT_MAP_PANEL_CLASS = 'bg-[#12171d] px-4 pt-4 pb-2 sm:px-5 sm:pt-5';
const WORKOUT_MAP_VISUALIZATION_CLASS = 'mt-1 h-36';
const WORKOUT_PANEL_HEADER_CLASS = 'flex min-h-6 items-start justify-between gap-3';
const WORKOUT_PANEL_TITLE_CLASS =
	'shrink-0 font-bold text-[10px] text-slate-500 uppercase tracking-[.14em]';

function workoutCompletionLabels(routeType: WorkoutRouteType): {
	completed: string;
	ridden: string;
	unit: string;
} {
	switch (routeType) {
		case WORKOUT_ROUTE_TYPE.LOOP:
			return { completed: 'Laps completed', ridden: 'Ridden this lap', unit: 'lap' };
		case WORKOUT_ROUTE_TYPE.OUT_AND_BACK:
			return { completed: 'Trips completed', ridden: 'Ridden this trip', unit: 'trip' };
		case WORKOUT_ROUTE_TYPE.POINT_TO_POINT:
			return { completed: 'Route completed', ridden: 'Ridden this route', unit: 'route' };
		default:
			return { completed: '', ridden: '', unit: '' };
	}
}

function WorkoutStats({
	compact = false,
	highlighted = false,
	stats,
}: {
	compact?: boolean;
	highlighted?: boolean;
	stats: WorkoutStat[];
}) {
	const columnClass = stats.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
	const labelSize = highlighted ? 'text-[10px]' : 'text-[9px]';
	const valueSize = highlighted ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl';
	const defaultValueColor = highlighted ? 'text-mint' : 'text-white';
	const gridClassName = compact
		? `grid w-full gap-2 text-center tabular-nums lg:gap-5 ${columnClass}`
		: 'grid grid-cols-3 gap-5 text-center tabular-nums';
	return (
		<div className={gridClassName}>
			{stats.map((stat) => (
				<div className={compact ? 'min-w-0' : undefined} key={stat.label}>
					<p
						className={`whitespace-nowrap font-bold text-slate-500 uppercase ${compact ? 'tracking-[.14em]' : 'tracking-widest'} ${labelSize}`}
					>
						{stat.label}
					</p>
					<p
						className={`mt-1 whitespace-nowrap font-bold leading-none ${valueSize} ${stat.color ? '' : (stat.valueClassName ?? defaultValueColor)}`}
						style={{ color: stat.color }}
					>
						{stat.value}
					</p>
				</div>
			))}
		</div>
	);
}

export function WorkoutProgress({
	elevationTotals,
	isRiding,
	speedUnit,
	targetResistance,
	terrain,
	variant = 'dashboard',
	workout,
}: {
	elevationTotals: ElevationTotals;
	isRiding: boolean;
	speedUnit: SpeedUnit;
	targetResistance?: number;
	terrain: WorkoutTerrain;
	variant?: 'dashboard' | 'session';
	workout: SessionWorkout;
}) {
	const { course } = workout;
	const sessionSummary = variant === 'session';
	const completion = workoutCompletionLabels(course.routeType);
	const elevationStats = [
		{ label: 'Course climb', value: formatElevation(course.elevationGain, speedUnit) },
		{ label: 'Climbed', value: formatElevation(elevationTotals.ascent, speedUnit) },
		{ label: 'Downhill', value: formatElevation(elevationTotals.descent, speedUnit) },
	];
	const mapStats = [
		{
			label: 'Progress',
			value: `${Math.round(terrain.progress * 100)}%`,
			valueClassName: 'text-mint',
		},
		{
			color: GRADE_METRIC_PRESENTATION.chartColor,
			label: 'Grade',
			value: formatGrade(terrain.grade),
		},
		...(sessionSummary
			? []
			: [
					{
						color: RESISTANCE_METRIC_PRESENTATION.chartColor,
						label: 'Resistance',
						value: `${Math.round(targetResistance ?? terrain.resistance)}%`,
					},
				]),
	];
	return (
		<section className="mt-6 overflow-hidden rounded-2xl border border-mint/20 bg-panel">
			<header className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-5 py-2">
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="font-bold text-base">{course.name}</h2>
					<span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-[9px] text-slate-500 uppercase tracking-[.12em]">
						<span className="h-0.5 w-3 rounded-full bg-mint" />
						{completion.ridden}
					</span>
				</div>
				<div className="flex items-center gap-2 text-right">
					<p className="font-bold text-[8px] text-mint uppercase tracking-[.16em]">
						{completion.completed}
					</p>
					<output
						aria-label={`${terrain.completedLaps} ${completion.unit}${terrain.completedLaps === 1 ? '' : 's'} completed`}
						className="block min-w-7 font-bold text-3xl text-white tabular-nums leading-none"
					>
						{terrain.completedLaps}
					</output>
				</div>
			</header>
			<div className="grid gap-px bg-line md:grid-cols-2">
				<div className={WORKOUT_MAP_PANEL_CLASS}>
					{sessionSummary ? (
						<>
							<div className={WORKOUT_PANEL_HEADER_CLASS}>
								<h3 className={WORKOUT_PANEL_TITLE_CLASS}>Course map</h3>
								<p className="whitespace-nowrap font-semibold text-base text-slate-300 tabular-nums">
									{formatDistanceProgress(
										terrain.distance,
										course.distance,
										speedUnit
									)}
								</p>
							</div>
							<div className="mt-3 min-h-16">
								<WorkoutStats compact stats={mapStats} />
							</div>
						</>
					) : (
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 className="font-bold text-[10px] text-slate-500 uppercase tracking-[.14em]">
									Course map
								</h3>
								<p className="mt-1 whitespace-nowrap font-semibold text-base text-slate-300 tabular-nums sm:text-lg">
									{formatDistanceProgress(
										terrain.distance,
										course.distance,
										speedUnit
									)}
								</p>
							</div>
							<WorkoutStats highlighted stats={mapStats} />
						</div>
					)}
					<WorkoutRouteVisualization
						className={WORKOUT_MAP_VISUALIZATION_CLASS}
						course={course}
						isRiding={isRiding}
						terrain={terrain}
						view={WORKOUT_VIEW.MAP}
					/>
				</div>
				<div className={WORKOUT_MAP_PANEL_CLASS}>
					{sessionSummary ? (
						<>
							<div className={WORKOUT_PANEL_HEADER_CLASS}>
								<h3 className={WORKOUT_PANEL_TITLE_CLASS}>Elevation profile</h3>
							</div>
							<div className="mt-3 min-h-16">
								<WorkoutStats compact stats={elevationStats} />
							</div>
						</>
					) : (
						<div className="flex min-h-14 flex-wrap items-start justify-between gap-3">
							<h3 className="font-bold text-[10px] text-slate-500 uppercase tracking-[.14em]">
								Elevation profile
							</h3>
							<WorkoutStats stats={elevationStats} />
						</div>
					)}
					<WorkoutRouteVisualization
						className={WORKOUT_MAP_VISUALIZATION_CLASS}
						course={course}
						isRiding={isRiding}
						terrain={terrain}
						view={WORKOUT_VIEW.PROFILE}
					/>
				</div>
			</div>
		</section>
	);
}
