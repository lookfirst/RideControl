import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatAggregateAverage, formatDuration } from '../lib/format';
import {
	type HistoryShortcut,
	historyKeyboardShortcuts,
	historyShortcutForKey,
} from '../lib/keyboard';
import {
	adjacentSession,
	countSavedSessions,
	deleteSavedSession,
	feelingLabel,
	formatSessionDateRange,
	formatSessionListTime,
	formatSessionTimeRange,
	getSavedSession,
	groupSessionsByDate,
	listSavedSessions,
	sessionListAfterDelete,
} from '../lib/saved-sessions';
import { downloadSessionTcx } from '../lib/tcx';
import type { SavedSession, SavedSessionSummary, SpeedUnit } from '../types';
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import { SessionMetric, SmallMetric } from './metrics';
import { SessionChart } from './session-chart';

const PAGE_SIZE = 30;
const EMPTY_ROUTE: [] = [];

function shouldIgnoreHistoryAction(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null;
	return (
		event.defaultPrevented ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		target?.matches("input, textarea, select, [contenteditable='true']")
	);
}

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
	const unitFactor = speedUnit === 'mph' ? 0.621_371 : 1;
	const distanceUnit = speedUnit === 'mph' ? 'mi' : 'km';
	const usesGear = session.controlMode === 'gear';
	const controlMetric = usesGear
		? {
				accent: 'mint',
				average: formatAggregateAverage(session.aggregates.gear, 0),
				icon: 'controls',
				label: 'GEAR',
				unit: '',
			}
		: {
				accent: 'mint',
				average: formatAggregateAverage(session.aggregates.resistance, 0),
				icon: 'resistance',
				label: 'RESISTANCE',
				unit: '%',
			};

	return (
		<div className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
			<div className="relative flex items-start justify-between gap-4">
				<div>
					<p className="font-bold text-[11px] text-mint tracking-[.14em]">
						{formatSessionDateRange(session)}
					</p>
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
			<div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-[#12171d]">
				<SmallMetric label="RECORDED" value={formatDuration(session.elapsedSeconds)} />
				<SmallMetric
					label="DISTANCE"
					value={`${(session.distance * unitFactor).toFixed(2)} ${distanceUnit}`}
				/>
				<SmallMetric label="CALORIES" value={`${Math.round(session.calories)} kcal`} />
			</div>
			<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{[
					{
						accent: 'yellow',
						average: formatAggregateAverage(session.aggregates.power, 0),
						icon: 'bolt',
						label: 'POWER',
						maximum: String(Math.round(session.maximums.power)),
						unit: 'W',
					},
					{
						accent: 'violet',
						average: formatAggregateAverage(session.aggregates.cadence, 0),
						icon: 'cadence',
						label: 'CADENCE',
						maximum: String(Math.round(session.maximums.cadence)),
						unit: 'rpm',
					},
					{
						accent: 'rose',
						average: formatAggregateAverage(session.aggregates.heartRate, 0),
						icon: 'heart',
						label: 'HEART RATE',
						maximum: String(Math.round(session.maximums.heartRate)),
						unit: 'bpm',
					},
					controlMetric,
				].map((metric) => (
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
				route={EMPTY_ROUTE}
				speedUnit={speedUnit}
			/>
		</div>
	);
}

export function SessionHistory({
	onClose,
	onStartNew,
	open,
	speedUnit,
}: {
	onClose: () => void;
	onStartNew: (session: SavedSession) => void;
	open: boolean;
	speedUnit: SpeedUnit;
}) {
	const [summaries, setSummaries] = useState<SavedSessionSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [selected, setSelected] = useState<SavedSession>();
	const [selectedId, setSelectedId] = useState<string>();
	const [loading, setLoading] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
	const [historyHelpOpen, setHistoryHelpOpen] = useState(false);
	const [rendered, setRendered] = useState(open);
	const [trayVisible, setTrayVisible] = useState(open);
	const [error, setError] = useState('');
	const deleteInProgress = useRef(false);
	const groups = useMemo(() => groupSessionsByDate(summaries), [summaries]);
	const unitFactor = speedUnit === 'mph' ? 0.621_371 : 1;
	const distanceUnit = speedUnit === 'mph' ? 'mi' : 'km';

	useEffect(() => {
		let frame: number | undefined;
		let timeout: number | undefined;
		if (open) {
			setRendered(true);
			frame = window.requestAnimationFrame(() => setTrayVisible(true));
		} else {
			setTrayVisible(false);
			setDeleteConfirmationOpen(false);
			setHistoryHelpOpen(false);
			timeout = window.setTimeout(() => setRendered(false), 200);
		}
		return () => {
			if (frame !== undefined) {
				window.cancelAnimationFrame(frame);
			}
			if (timeout !== undefined) {
				window.clearTimeout(timeout);
			}
		};
	}, [open]);

	const selectSession = useCallback(async (id: string) => {
		setDeleteConfirmationOpen(false);
		setHistoryHelpOpen(false);
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
			setDeleteConfirmationOpen(false);
			setHistoryHelpOpen(false);
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

	const deleteSelectedSession = useCallback(async () => {
		if (!selected || deleteInProgress.current) {
			return;
		}
		deleteInProgress.current = true;
		setDeleting(true);
		try {
			await deleteSavedSession(selected.id);
			setDeleteConfirmationOpen(false);
			const updated = sessionListAfterDelete(summaries, selected.id);
			setSummaries(updated.sessions);
			setTotal((current) => Math.max(0, current - 1));
			setError('');
			if (updated.next) {
				await selectSession(updated.next.id);
			} else {
				setSelected(undefined);
				setSelectedId(undefined);
			}
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
		} finally {
			deleteInProgress.current = false;
			setDeleting(false);
		}
	}, [selected, selectSession, summaries]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const selectAdjacent = (event: KeyboardEvent, direction: 'next' | 'previous') => {
			if (deleteConfirmationOpen || historyHelpOpen) {
				return;
			}
			event.preventDefault();
			const next = adjacentSession(summaries, selectedId, direction);
			if (next) {
				selectSession(next.id);
			}
		};
		const shortcutHandlers: Record<HistoryShortcut, (event: KeyboardEvent) => void> = {
			close: (event) => {
				event.preventDefault();
				if (historyHelpOpen) {
					setHistoryHelpOpen(false);
				} else if (deleteConfirmationOpen) {
					setDeleteConfirmationOpen(false);
				} else {
					onClose();
				}
			},
			confirmDelete: (event) => {
				const target = event.target as HTMLElement | null;
				if (
					!deleteConfirmationOpen ||
					target?.matches("button, a, input, textarea, select, [contenteditable='true']")
				) {
					return;
				}
				event.preventDefault();
				deleteSelectedSession();
			},
			deleteSession: (event) => {
				if (deleteConfirmationOpen || historyHelpOpen || !selected) {
					return;
				}
				event.preventDefault();
				setDeleteConfirmationOpen(true);
			},
			help: (event) => {
				if (deleteConfirmationOpen || historyHelpOpen) {
					return;
				}
				event.preventDefault();
				setHistoryHelpOpen(true);
			},
			nextSession: (event) => selectAdjacent(event, 'next'),
			previousSession: (event) => selectAdjacent(event, 'previous'),
		};
		const handleHistoryKeys = (event: KeyboardEvent) => {
			const shortcut = historyShortcutForKey(event.key);
			if (!shortcut || (shortcut !== 'close' && shouldIgnoreHistoryAction(event))) {
				return;
			}
			shortcutHandlers[shortcut](event);
		};
		window.addEventListener('keydown', handleHistoryKeys);
		return () => window.removeEventListener('keydown', handleHistoryKeys);
	}, [
		deleteConfirmationOpen,
		deleteSelectedSession,
		historyHelpOpen,
		onClose,
		open,
		selectSession,
		selected,
		selectedId,
		summaries,
	]);

	if (!rendered) {
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
		detail = (
			<SessionDetail
				chartKeyboardEnabled={open && !(deleteConfirmationOpen || historyHelpOpen)}
				deleteConfirmationOpen={deleteConfirmationOpen}
				deleting={deleting}
				key={selected.id}
				onCancelDelete={() => setDeleteConfirmationOpen(false)}
				onConfirmDelete={() => deleteSelectedSession()}
				onDelete={() => setDeleteConfirmationOpen(true)}
				onStartNew={() => onStartNew(selected)}
				session={selected}
				speedUnit={speedUnit}
			/>
		);
	} else if (summaries.length > 0) {
		detail = (
			<div className="grid min-h-64 flex-1 place-items-center text-slate-500 text-sm">
				Select a session
			</div>
		);
	}

	return (
		<div
			className={`fixed inset-0 z-40 bg-black/35 transition-opacity duration-200 ${trayVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
		>
			<button
				aria-label="Close session history"
				className="absolute inset-0 cursor-default"
				onClick={onClose}
				type="button"
			/>
			<section
				aria-labelledby="session-history-title"
				aria-modal="true"
				className={`relative z-10 ml-auto flex h-full w-full max-w-6xl flex-col overflow-hidden border-slate-600 border-l bg-panel shadow-2xl shadow-black/60 transition-transform duration-200 ease-out sm:w-[min(72rem,calc(100vw-2rem))] ${trayVisible ? 'translate-x-0' : 'translate-x-full'}`}
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
					<div className="flex items-center gap-1">
						<button
							aria-label="Show history keyboard controls"
							className="grid h-9 w-9 place-items-center rounded-lg font-bold text-slate-400 text-sm hover:bg-slate-700 hover:text-white"
							onClick={() => {
								setDeleteConfirmationOpen(false);
								setHistoryHelpOpen(true);
							}}
							type="button"
						>
							?
						</button>
						<button
							aria-label="Close session history"
							className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
							onClick={onClose}
							type="button"
						>
							×
						</button>
					</div>
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
													{formatSessionListTime(session)}
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
			</section>
			<KeyboardShortcutsDialog
				handleEscape={false}
				onClose={() => setHistoryHelpOpen(false)}
				open={historyHelpOpen}
				shortcuts={historyKeyboardShortcuts}
				title="History keyboard controls"
			/>
		</div>
	);
}
