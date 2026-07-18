import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatAggregateAverage, formatDuration } from '../lib/format';
import {
	countSavedSessions,
	formatSessionTime,
	getSavedSession,
	groupSessionsByDate,
	listSavedSessions,
} from '../lib/saved-sessions';
import type { SavedSession, SavedSessionSummary, SessionFeeling, SpeedUnit } from '../types';
import { SmallMetric } from './metrics';
import { SessionChart } from './session-chart';

const PAGE_SIZE = 30;
const EMPTY_ROUTE: [] = [];

export function feelingLabel(feeling?: SessionFeeling): string {
	if (!feeling) {
		return 'Not recorded';
	}
	return feeling[0].toUpperCase() + feeling.slice(1);
}

export function SessionDetail({
	session,
	speedUnit,
}: {
	session: SavedSession;
	speedUnit: SpeedUnit;
}) {
	const unitFactor = speedUnit === 'mph' ? 0.621_371 : 1;
	const distanceUnit = speedUnit === 'mph' ? 'mi' : 'km';
	return (
		<div className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
			<p className="font-bold text-[11px] text-mint tracking-[.14em]">
				{new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
					session.startedAt
				)}
			</p>
			<h3 className="mt-1 font-bold text-2xl">
				{formatSessionTime(session.startedAt)} session
			</h3>
			<div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-[#12171d]">
				<SmallMetric label="TIME" value={formatDuration(session.elapsedSeconds)} />
				<SmallMetric
					label="DISTANCE"
					value={`${(session.distance * unitFactor).toFixed(2)} ${distanceUnit}`}
				/>
				<SmallMetric label="CALORIES" value={`${Math.round(session.calories)} kcal`} />
			</div>
			<div className="mt-5 grid gap-3 sm:grid-cols-3">
				{[
					{
						average: formatAggregateAverage(session.aggregates.power, 0),
						label: 'Power',
						maximum: Math.round(session.maximums.power),
						unit: 'W',
					},
					{
						average: formatAggregateAverage(session.aggregates.cadence, 0),
						label: 'Cadence',
						maximum: Math.round(session.maximums.cadence),
						unit: 'rpm',
					},
					{
						average: formatAggregateAverage(session.aggregates.heartRate, 0),
						label: 'Heart rate',
						maximum: Math.round(session.maximums.heartRate),
						unit: 'bpm',
					},
				].map((metric) => (
					<div
						className="rounded-xl border border-line bg-[#12171d] p-3"
						key={metric.label}
					>
						<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">
							{metric.label.toUpperCase()}
						</p>
						<p className="mt-1 font-semibold text-lg">
							{metric.average} <span className="text-slate-500 text-xs">avg</span>
						</p>
						<p className="text-slate-400 text-xs">
							{metric.maximum} {metric.unit} max
						</p>
					</div>
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
			<SessionChart history={session.history} route={EMPTY_ROUTE} speedUnit={speedUnit} />
		</div>
	);
}

export function SessionHistory({
	onClose,
	open,
	speedUnit,
}: {
	onClose: () => void;
	open: boolean;
	speedUnit: SpeedUnit;
}) {
	const [summaries, setSummaries] = useState<SavedSessionSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [selected, setSelected] = useState<SavedSession>();
	const [selectedId, setSelectedId] = useState<string>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const groups = useMemo(() => groupSessionsByDate(summaries), [summaries]);
	const unitFactor = speedUnit === 'mph' ? 0.621_371 : 1;
	const distanceUnit = speedUnit === 'mph' ? 'mi' : 'km';

	const selectSession = useCallback(async (id: string) => {
		setSelectedId(id);
		setLoading(true);
		try {
			setSelected(await getSavedSession(id));
			setError('');
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : String(loadError));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!open) {
			return;
		}
		let cancelled = false;
		async function loadHistory() {
			const [sessions, count] = await Promise.all([
				listSavedSessions(PAGE_SIZE),
				countSavedSessions(),
			]);
			if (cancelled) {
				return;
			}
			setSummaries(sessions);
			setTotal(count);
			setError('');
			if (sessions[0]) {
				await selectSession(sessions[0].id);
			} else {
				setSelected(undefined);
				setSelectedId(undefined);
			}
		}
		loadHistory().catch((loadError: unknown) => {
			if (!cancelled) {
				setError(loadError instanceof Error ? loadError.message : String(loadError));
			}
		});
		return () => {
			cancelled = true;
		};
	}, [open, selectSession]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
	}, [onClose, open]);

	if (!open) {
		return null;
	}

	async function loadMore() {
		const last = summaries.at(-1);
		if (!last) {
			return;
		}
		const more = await listSavedSessions(PAGE_SIZE, last.endedAt);
		setSummaries((current) => [...current, ...more]);
	}

	let detail: ReactNode = null;
	if (loading) {
		detail = (
			<div className="grid min-h-64 flex-1 place-items-center text-slate-500 text-sm">
				Loading session…
			</div>
		);
	} else if (selected) {
		detail = <SessionDetail session={selected} speedUnit={speedUnit} />;
	} else if (summaries.length > 0) {
		detail = (
			<div className="grid min-h-64 flex-1 place-items-center text-slate-500 text-sm">
				Select a session
			</div>
		);
	}

	return (
		<div className="fixed inset-0 z-40 bg-black/70 p-3 backdrop-blur-sm sm:p-6">
			<section
				aria-labelledby="session-history-title"
				aria-modal="true"
				className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-panel shadow-2xl shadow-black/60"
				role="dialog"
			>
				<header className="flex items-center justify-between border-line border-b px-5 py-4">
					<div>
						<h2 className="font-bold text-xl" id="session-history-title">
							Session history
						</h2>
						<p className="mt-0.5 text-slate-500 text-xs">
							Saved on this device · {total} {total === 1 ? 'session' : 'sessions'}
						</p>
					</div>
					<button
						aria-label="Close session history"
						className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</header>
				<div className="flex min-h-0 flex-1 flex-col md:flex-row">
					<aside className="max-h-64 shrink-0 overflow-y-auto border-line border-b bg-[#12171d] p-3 md:max-h-none md:w-80 md:border-r md:border-b-0">
						{error ? <p className="p-3 text-rose-300 text-sm">{error}</p> : null}
						{summaries.length === 0 && !error ? (
							<div className="p-6 text-center">
								<p className="font-semibold">No saved sessions yet</p>
								<p className="mt-1 text-slate-500 text-sm">
									End a session to save it here.
								</p>
							</div>
						) : null}
						{groups.map((group) => (
							<div className="mb-4" key={group.key}>
								<h3 className="px-2 pb-1.5 font-bold text-[10px] text-slate-500 tracking-[.1em]">
									{group.date.toUpperCase()}
								</h3>
								<div className="space-y-1">
									{group.sessions.map((session) => (
										<button
											className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${selectedId === session.id ? 'border-mint/40 bg-mint/10' : 'border-transparent hover:border-line hover:bg-slate-800/50'}`}
											key={session.id}
											onClick={() => selectSession(session.id)}
											type="button"
										>
											<div className="flex items-center justify-between gap-3">
												<span className="font-semibold text-sm">
													{formatSessionTime(session.startedAt)}
												</span>
												<span className="text-slate-500 text-xs">
													{formatDuration(session.elapsedSeconds)}
												</span>
											</div>
											<p className="mt-1 text-slate-400 text-xs">
												{(session.distance * unitFactor).toFixed(2)}{' '}
												{distanceUnit}
												{session.feeling
													? ` · ${feelingLabel(session.feeling)}`
													: null}
											</p>
										</button>
									))}
								</div>
							</div>
						))}
						{summaries.length < total ? (
							<button
								className="w-full rounded-lg border border-line px-3 py-2 font-semibold text-slate-400 text-xs hover:border-slate-500 hover:text-white"
								onClick={() => loadMore()}
								type="button"
							>
								Load more
							</button>
						) : null}
					</aside>
					{detail}
				</div>
				<footer className="border-line border-t px-5 py-3 text-slate-600 text-xs">
					Browser storage can still be removed by clearing this site's data.
				</footer>
			</section>
		</div>
	);
}
