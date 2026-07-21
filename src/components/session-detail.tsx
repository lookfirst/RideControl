import { useEffect, useRef } from 'react';
import { EMPTY_ROUTE } from '../constants';
import { usePersistentScrollPosition } from '../hooks/use-persistent-scroll-position';
import { CONTROL_MODE } from '../lib/control-mode';
import { aggregateMaximum, formatAggregateAverage, formatWholeNumber } from '../lib/format';
import { resistanceForVirtualGear } from '../lib/gears';
import { METRIC_PRESENTATION, STANDARD_METRIC_KEYS } from '../lib/metric-presentation';
import {
	feelingLabel,
	formatSessionDateRange,
	formatSessionImportLabel,
	formatSessionTimeRange,
	isImportedSession,
} from '../lib/saved-sessions';
import { sessionDetailScrollPositionStorageKey } from '../lib/session-history-preferences';
import { downloadSessionTcx } from '../lib/tcx';
import { workoutTerrainAtDistance } from '../lib/workouts';
import type { SavedSession, SpeedUnit } from '../types';
import { SessionMetric } from './metrics';
import { SessionChart } from './session-chart';
import { SessionSummary } from './session-summary';
import { WorkoutProgress } from './workout-progress';

export function DeleteSessionDialog({
	deleting,
	onCancel,
	onConfirm,
	open,
}: {
	deleting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}) {
	const confirmButton = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (open) {
			confirmButton.current?.focus();
		}
	}, [open]);

	if (!open) {
		return null;
	}

	return (
		<section
			aria-describedby="delete-session-description"
			aria-labelledby="delete-session-title"
			aria-modal="true"
			className="absolute top-0 right-0 z-30 w-full max-w-sm rounded-xl border border-rose-400/40 bg-panel/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-sm"
			role="alertdialog"
		>
			<h2 className="font-bold text-lg" id="delete-session-title">
				Delete this session?
			</h2>
			<p className="mt-1 text-slate-400 text-sm" id="delete-session-description">
				This cannot be undone.
			</p>
			<div className="mt-4 flex justify-end gap-2">
				<button
					className="rounded-lg px-3 py-2 font-semibold text-slate-400 text-xs hover:bg-slate-800 hover:text-white"
					disabled={deleting}
					onClick={onCancel}
					type="button"
				>
					Cancel
				</button>
				<button
					className="rounded-lg bg-rose-400 px-3 py-2 font-bold text-ink text-xs hover:bg-rose-300 disabled:opacity-50"
					disabled={deleting}
					onClick={onConfirm}
					ref={confirmButton}
					type="button"
				>
					{deleting ? 'Deleting…' : 'Delete permanently'}
				</button>
			</div>
		</section>
	);
}

export function SessionDetail({
	chartKeyboardEnabled = true,
	deleteConfirmationOpen = false,
	deleting = false,
	onCancelDelete,
	onConfirmDelete,
	onDelete,
	onStartNew,
	session,
	speedUnit,
}: {
	chartKeyboardEnabled?: boolean;
	deleteConfirmationOpen?: boolean;
	deleting?: boolean;
	onCancelDelete?: () => void;
	onConfirmDelete?: () => void;
	onDelete?: () => void;
	onStartNew?: () => void;
	session: SavedSession;
	speedUnit: SpeedUnit;
}) {
	const detailScroll = usePersistentScrollPosition(
		sessionDetailScrollPositionStorageKey(session.id),
		true
	);
	const usesGear = session.controlMode === CONTROL_MODE.GEAR;
	const imported = isImportedSession(session);
	const workoutTerrain = session.workout
		? workoutTerrainAtDistance(session.workout.course, session.distance)
		: undefined;
	const finalGear = session.history.findLast((sample) => sample.gear !== undefined)?.gear;
	const workoutResistance =
		workoutTerrain && finalGear !== undefined
			? resistanceForVirtualGear(workoutTerrain.resistance, finalGear)
			: undefined;
	const controlMetric = usesGear
		? {
				accent: 'mint',
				average: formatAggregateAverage(session.aggregates.gear, 0),
				icon: 'controls',
				label: 'GEAR',
				maximum: formatWholeNumber(aggregateMaximum(session.aggregates.gear)),
				unit: '',
			}
		: {
				accent: 'mint',
				average: formatAggregateAverage(session.aggregates.resistance, 0),
				icon: 'resistance',
				label: 'RESISTANCE',
				maximum: formatWholeNumber(aggregateMaximum(session.aggregates.resistance)),
				unit: '%',
			};
	const standardMetrics = STANDARD_METRIC_KEYS.map((key) => {
		const presentation = METRIC_PRESENTATION[key];
		return {
			accent: presentation.accent,
			average: formatAggregateAverage(session.aggregates[key], 0),
			icon: presentation.icon,
			label: presentation.label.toUpperCase(),
			maximum: formatWholeNumber(session.maximums[key]),
			unit: presentation.unit,
		};
	});

	return (
		<div
			className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6"
			data-testid="session-detail"
			onScroll={detailScroll.onScroll}
			ref={detailScroll.ref}
		>
			<div className="relative flex items-start justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<p className="font-bold text-[11px] text-mint tracking-[.14em]">
							{formatSessionDateRange(session)}
						</p>
						{imported ? (
							<span
								className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 font-bold text-[9px] text-cyan-300 uppercase tracking-wide"
								title={formatSessionImportLabel(session)}
							>
								Imported
							</span>
						) : null}
					</div>
					<h3 className="mt-1 font-bold text-2xl">{formatSessionTimeRange(session)}</h3>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<button
						className="rounded-lg border border-slate-500/40 px-3 py-2 font-semibold text-slate-300 text-xs transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
						disabled={session.history.length === 0}
						onClick={() => downloadSessionTcx(session)}
						title={
							session.history.length === 0
								? 'No recorded samples to export'
								: 'Download a TCX file for Strava and other bike services'
						}
						type="button"
					>
						Download TCX
					</button>
					{onStartNew ? (
						<button
							className="rounded-lg border border-mint/30 px-3 py-2 font-semibold text-mint text-xs transition hover:border-mint/60 hover:bg-mint/5"
							onClick={onStartNew}
							type="button"
						>
							Start new session
						</button>
					) : null}
					{onDelete ? (
						<button
							className="rounded-lg border border-rose-400/30 px-3 py-2 font-semibold text-rose-300 text-xs transition hover:border-rose-400/60 hover:bg-rose-400/5"
							onClick={onDelete}
							type="button"
						>
							Delete session
						</button>
					) : null}
				</div>
				{onCancelDelete && onConfirmDelete ? (
					<DeleteSessionDialog
						deleting={deleting}
						onCancel={onCancelDelete}
						onConfirm={onConfirmDelete}
						open={deleteConfirmationOpen}
					/>
				) : null}
			</div>
			<div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl bg-[#12171d] ring-1 ring-line ring-inset">
				<SessionSummary
					calories={session.calories}
					distance={session.distance}
					elapsedSeconds={session.elapsedSeconds}
					speedUnit={speedUnit}
					timeLabel="RECORDED"
				/>
			</div>
			{session.workout && workoutTerrain ? (
				<WorkoutProgress
					elevationTotals={session.elevationTotals}
					isRiding={false}
					speedUnit={speedUnit}
					targetResistance={workoutResistance}
					terrain={workoutTerrain}
					workout={session.workout}
				/>
			) : null}
			<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{[...standardMetrics, controlMetric].map((metric) => (
					<SessionMetric key={metric.label} {...metric} />
				))}
			</div>
			<div className="mt-5 grid gap-4 sm:grid-cols-[.35fr_.65fr]">
				<div className="rounded-xl border border-line bg-[#12171d] p-4">
					<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">FELT</p>
					<p className="mt-1 whitespace-pre-wrap text-slate-300 text-sm">
						{feelingLabel(session.feeling)}
					</p>
				</div>
				<div className="rounded-xl border border-line bg-[#12171d] p-4">
					<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">
						COMMENTS
					</p>
					<p className="mt-1 whitespace-pre-wrap text-slate-300 text-sm">
						{session.comments || 'No comments'}
					</p>
				</div>
			</div>
			<SessionChart
				controlMode={session.controlMode}
				history={session.history}
				keyboardEnabled={chartKeyboardEnabled}
				route={session.workout?.course.points ?? EMPTY_ROUTE}
				speedUnit={speedUnit}
			/>
		</div>
	);
}
