import { formatGrade } from '../lib/format';
import { formatDistanceProgress, formatElevation } from '../lib/units';
import { WORKOUT_ROUTE_TYPE, WORKOUT_VIEW } from '../lib/workout-schema';
import type { ElevationTotals, SessionWorkout, SpeedUnit, WorkoutTerrain } from '../types';
import { WorkoutRouteVisualization } from './workout-route-visualization';

interface WorkoutStat {
	label: string;
	value: string;
}

function WorkoutStats({
	highlighted = false,
	stats,
}: {
	highlighted?: boolean;
	stats: WorkoutStat[];
}) {
	const labelSize = highlighted ? 'text-[10px]' : 'text-[9px]';
	const valueSize = highlighted ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl';
	return (
		<div className="grid grid-cols-3 gap-5 text-center tabular-nums">
			{stats.map((stat) => (
				<div key={stat.label}>
					<p
						className={`font-bold text-slate-500 uppercase tracking-widest ${labelSize}`}
					>
						{stat.label}
					</p>
					<p
						className={`mt-1 whitespace-nowrap font-bold leading-none ${valueSize} ${highlighted ? 'text-mint' : 'text-white'}`}
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
	terrain,
	workout,
}: {
	elevationTotals: ElevationTotals;
	isRiding: boolean;
	speedUnit: SpeedUnit;
	terrain: WorkoutTerrain;
	workout: SessionWorkout;
}) {
	const { course } = workout;
	const outAndBack = course.routeType === WORKOUT_ROUTE_TYPE.OUT_AND_BACK;
	const completionUnit = outAndBack ? 'trip' : 'lap';
	const elevationStats = [
		{ label: 'Course climb', value: formatElevation(course.elevationGain, speedUnit) },
		{ label: 'Climbed', value: formatElevation(elevationTotals.ascent, speedUnit) },
		{ label: 'Downhill', value: formatElevation(elevationTotals.descent, speedUnit) },
	];
	const mapStats = [
		{ label: 'Progress', value: `${Math.round(terrain.progress * 100)}%` },
		{
			label: 'Grade',
			value: formatGrade(terrain.grade),
		},
		{ label: 'Resistance', value: `${terrain.resistance}%` },
	];
	return (
		<section className="mt-6 overflow-hidden rounded-2xl border border-mint/20 bg-panel">
			<header className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-5 py-2">
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="font-bold text-base">{course.name}</h2>
					<span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-[9px] text-slate-500 uppercase tracking-[.12em]">
						<span className="h-0.5 w-3 rounded-full bg-mint" />
						Ridden this {completionUnit}
					</span>
				</div>
				<div className="flex items-center gap-2 text-right">
					<p className="font-bold text-[8px] text-mint uppercase tracking-[.16em]">
						{outAndBack ? 'Trips completed' : 'Laps completed'}
					</p>
					<output
						aria-label={`${terrain.completedLaps} ${completionUnit}${terrain.completedLaps === 1 ? '' : 's'} completed`}
						className="block min-w-7 font-bold text-3xl text-white tabular-nums leading-none"
					>
						{terrain.completedLaps}
					</output>
				</div>
			</header>
			<div className="grid gap-px bg-line md:grid-cols-2">
				<div className="bg-[#12171d] p-4 sm:p-5">
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
					<WorkoutRouteVisualization
						className="mt-2 h-44"
						course={course}
						isRiding={isRiding}
						terrain={terrain}
						view={WORKOUT_VIEW.MAP}
					/>
				</div>
				<div className="bg-[#12171d] p-4 sm:p-5">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<h3 className="font-bold text-[10px] text-slate-500 uppercase tracking-[.14em]">
							Elevation profile
						</h3>
						<WorkoutStats stats={elevationStats} />
					</div>
					<WorkoutRouteVisualization
						className="mt-2 h-44"
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
