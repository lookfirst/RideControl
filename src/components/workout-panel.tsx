import { useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { formatDistance, formatElevation } from '../lib/units';
import { downloadWorkoutFile } from '../lib/workout-file';
import { WORKOUT_ROUTE_TYPE, WORKOUT_VIEW } from '../lib/workout-schema';
import { workoutDifficultyLabel, workoutMaximumGrade } from '../lib/workouts';
import type { SpeedUnit, WorkoutCourse } from '../types';
import { SideTray } from './side-tray';
import { WorkoutRouteVisualization } from './workout-route-visualization';

function WorkoutCourseCard({
	course,
	custom,
	disabled,
	onRemove,
	onSelect,
	selected,
	speedUnit,
}: {
	course: WorkoutCourse;
	custom: boolean;
	disabled: boolean;
	onRemove: () => void;
	onSelect: () => void;
	selected: boolean;
	speedUnit: SpeedUnit;
}) {
	return (
		<article
			className={`overflow-hidden rounded-2xl border bg-[#12171d] transition ${selected ? 'border-mint/50 shadow-[0_0_20px_rgba(173,245,189,.08)]' : 'border-line'}`}
		>
			<div className="grid grid-cols-2 gap-px bg-line">
				<div className="bg-[#10151a] px-4 py-2">
					<WorkoutRouteVisualization
						className="h-24"
						course={course}
						view={WORKOUT_VIEW.MAP}
					/>
				</div>
				<div className="bg-[#10151a] px-4 py-2">
					<WorkoutRouteVisualization
						className="h-24"
						course={course}
						view={WORKOUT_VIEW.PROFILE}
					/>
				</div>
			</div>
			<div className="p-4">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 className="font-bold text-base">{course.name}</h3>
						<p className="mt-1 text-slate-400 text-xs leading-relaxed">
							{course.description}
						</p>
					</div>
					<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
						{custom ? (
							<span className="rounded-full border border-cyan-400/30 bg-cyan-400/5 px-2 py-1 font-bold text-[9px] text-cyan-300 uppercase tracking-wide">
								Imported
							</span>
						) : null}
						<span className="rounded-full border border-slate-700 px-2 py-1 font-bold text-[9px] text-slate-400 uppercase tracking-wide">
							{workoutDifficultyLabel(course.difficulty)}
						</span>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-slate-500 text-xs tabular-nums">
					<span>
						{formatDistance(course.distance, speedUnit, 1)}{' '}
						{course.routeType === WORKOUT_ROUTE_TYPE.OUT_AND_BACK
							? 'out & back'
							: 'loop'}
					</span>
					<span>{formatElevation(course.elevationGain, speedUnit)} climbing</span>
					<span>Up to +{workoutMaximumGrade(course).toFixed(1)}%</span>
					<div className="ml-auto flex items-center gap-3 font-semibold">
						<button
							className="text-cyan-400 hover:text-cyan-200"
							onClick={() => downloadWorkoutFile(course)}
							type="button"
						>
							Download GPX
						</button>
						{custom ? (
							<button
								className="text-rose-400 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
								disabled={disabled}
								onClick={onRemove}
								type="button"
							>
								Remove
							</button>
						) : null}
					</div>
				</div>
				<button
					className={`mt-4 h-10 w-full rounded-lg border font-bold text-xs transition ${selected ? 'border-mint/30 bg-mint/10 text-mint' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-slate-500 hover:bg-slate-700/70 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}
					disabled={disabled || selected}
					onClick={onSelect}
					type="button"
				>
					{selected ? 'Selected' : 'Choose workout'}
				</button>
			</div>
		</article>
	);
}

export function WorkoutPanel({
	activeCourse,
	courses,
	customCourseIds,
	ended,
	onClose,
	onImportFile,
	onRemoveCourse,
	onSelect,
	open,
	selectionLocked,
	speedUnit,
}: {
	activeCourse?: WorkoutCourse;
	courses: WorkoutCourse[];
	customCourseIds: ReadonlySet<string>;
	ended: boolean;
	onClose: () => void;
	onImportFile: (file: File) => Promise<WorkoutCourse>;
	onRemoveCourse: (courseId: string) => void;
	onSelect: (course?: WorkoutCourse) => void;
	open: boolean;
	selectionLocked: boolean;
	speedUnit: SpeedUnit;
}) {
	const importInput = useRef<HTMLInputElement>(null);
	const [importing, setImporting] = useState(false);
	const [importStatus, setImportStatus] = useState('');
	const [importError, setImportError] = useState('');
	let notice =
		'Choose a course before you start riding. The route repeats until the session ends.';
	if (ended) {
		notice = 'Choose a workout for your next session, then start it when you are ready.';
	} else if (selectionLocked) {
		notice = 'End the current session before changing the workout.';
	}

	const importWorkout = async (file: File) => {
		setImporting(true);
		setImportStatus('');
		setImportError('');
		try {
			const course = await onImportFile(file);
			setImportStatus(`${course.name} imported and saved on this device.`);
		} catch (error) {
			setImportError(errorMessage(error));
		} finally {
			setImporting(false);
		}
	};

	return (
		<SideTray
			closeLabel="Close terrain workouts"
			labelledBy="workout-panel-title"
			onClose={onClose}
			open={open}
			panelClassName="max-w-xl"
		>
			<div className="flex h-full flex-col">
				<header className="flex items-start justify-between gap-4 border-line border-b px-5 py-5 sm:px-6">
					<div>
						<h2 className="font-bold text-xl" id="workout-panel-title">
							Terrain workouts
						</h2>
						<p className="mt-1 max-w-md text-slate-400 text-sm leading-relaxed">
							Resistance follows the climbs and descents while your position moves
							along the route.
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<input
							accept=".gpx,application/gpx+xml,application/xml,text/xml"
							className="hidden"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = '';
								if (file) {
									importWorkout(file);
								}
							}}
							ref={importInput}
							type="file"
						/>
						<button
							className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white disabled:cursor-wait disabled:opacity-60"
							disabled={importing}
							onClick={() => importInput.current?.click()}
							type="button"
						>
							{importing ? 'Importing…' : 'Import GPX'}
						</button>
						<button
							aria-label="Close terrain workouts"
							className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white"
							onClick={onClose}
							type="button"
						>
							×
						</button>
					</div>
				</header>
				<div className="border-line border-b bg-[#10151a] px-5 py-3 text-xs leading-relaxed sm:px-6">
					<p className="text-slate-500">{notice}</p>
					{importStatus ? (
						<p aria-live="polite" className="mt-1 text-cyan-300">
							{importStatus}
						</p>
					) : null}
					{importError ? (
						<p aria-live="assertive" className="mt-1 text-rose-300">
							{importError}
						</p>
					) : null}
				</div>
				<div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
					{courses.map((course) => (
						<WorkoutCourseCard
							course={course}
							custom={customCourseIds.has(course.id)}
							disabled={selectionLocked}
							key={course.id}
							onRemove={() => onRemoveCourse(course.id)}
							onSelect={() => onSelect(course)}
							selected={activeCourse?.id === course.id}
							speedUnit={speedUnit}
						/>
					))}
				</div>
				{activeCourse && !selectionLocked ? (
					<footer className="border-line border-t p-4 text-right sm:px-6">
						<button
							className="rounded-lg border border-line px-3 py-2 font-semibold text-slate-400 text-xs hover:border-slate-500 hover:text-white"
							onClick={() => onSelect(undefined)}
							type="button"
						>
							Ride without a workout
						</button>
					</footer>
				) : null}
			</div>
		</SideTray>
	);
}
