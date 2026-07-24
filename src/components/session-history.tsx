import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSessionHistory } from '../hooks/use-session-history';
import { useSessionInsights } from '../hooks/use-session-insights';
import {
	ACTIVITY_FILE_FORMAT,
	type ActivityFileFormat,
	isActivityFileFormat,
} from '../lib/activity-file';
import {
	eventTargetsEditableControl,
	eventTargetsInteractiveControl,
	keyboardEventHasModifiers,
} from '../lib/dom';
import {
	type HistoryShortcut,
	historyKeyboardShortcuts,
	historyShortcutForKey,
} from '../lib/keyboard';
import { adjacentSession } from '../lib/saved-sessions';
import {
	sessionCalendarMonth,
	sessionCalendarMonthFromKey,
	sessionCalendarMonthKey,
} from '../lib/session-calendar';
import {
	loadSessionDownloadFormat,
	saveSessionDownloadFormat,
} from '../lib/session-history-preferences';
import {
	loadSessionHistoryView,
	SESSION_HISTORY_VIEW,
	SESSION_HISTORY_VIEW_OPTIONS,
	type SessionHistoryView,
	saveSessionHistoryView,
} from '../lib/session-history-view';
import { preferencesStore } from '../stores/preferences-store';
import type { ChartMode, SavedSession, SpeedUnit } from '../types';
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import { SessionCalendar } from './session-calendar';
import { SessionDetail } from './session-detail';
import { SessionHistoryList } from './session-history-list';
import { SessionStatistics } from './session-statistics';
import { SideTray } from './side-tray';

function shouldIgnoreHistoryAction(event: KeyboardEvent) {
	return (
		event.defaultPrevented ||
		keyboardEventHasModifiers(event) ||
		eventTargetsEditableControl(event)
	);
}

export function SessionHistory({
	onClose,
	onSelectCalendarMonth,
	onSelectSessionId,
	onSelectView,
	onStartNew,
	open,
	requestedSessionId,
	requestedSessionMonth,
	requestedView,
	speedUnit,
}: {
	onClose: () => void;
	onSelectCalendarMonth: (month: string) => void;
	onSelectSessionId?: (sessionId: string) => void;
	onSelectView: (view: SessionHistoryView) => void;
	onStartNew: (session: SavedSession) => void;
	open: boolean;
	requestedSessionId?: string;
	requestedSessionMonth?: string;
	requestedView?: SessionHistoryView;
	speedUnit: SpeedUnit;
}) {
	const {
		deleteSelectedSession: deleteHistorySession,
		deleting,
		downloadAllActivityFiles,
		error,
		exporting,
		historyStatus,
		highlightedSessionIds,
		importActivityFile,
		importing,
		loading,
		loadMore,
		revision,
		selected,
		selectedId,
		selectSession: selectHistorySession,
		summaries,
		total,
	} = useSessionHistory(open, requestedSessionId);
	const [storedHistoryView, setStoredHistoryView] =
		useState<SessionHistoryView>(loadSessionHistoryView);
	const historyView = requestedView ?? storedHistoryView;
	const calendarMonth = useMemo(
		() =>
			sessionCalendarMonthFromKey(requestedSessionMonth) ??
			sessionCalendarMonth(selected ? new Date(selected.startedAt) : new Date()),
		[requestedSessionMonth, selected]
	);
	const {
		analytics,
		calendarSummaries,
		error: insightsError,
		loading: insightsLoading,
	} = useSessionInsights(open, calendarMonth, revision);
	const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
	const [historyHelpOpen, setHistoryHelpOpen] = useState(false);
	const [selectedChartMode, setSelectedChartMode] = useState<ChartMode>(
		() => preferencesStore.get().chartMode
	);
	const [downloadFormat, setDownloadFormat] =
		useState<ActivityFileFormat>(loadSessionDownloadFormat);
	const importInput = useRef<HTMLInputElement>(null);
	const transferring = exporting || importing;
	const navigationSummaries =
		historyView === SESSION_HISTORY_VIEW.CALENDAR ? calendarSummaries : summaries;

	useEffect(() => {
		if (open && selected) {
			onSelectSessionId?.(selected.id);
		}
	}, [onSelectSessionId, open, selected]);

	useEffect(() => {
		if (!open) {
			setDeleteConfirmationOpen(false);
			setHistoryHelpOpen(false);
		}
	}, [open]);

	const selectSession = useCallback(
		(id: string) => {
			setDeleteConfirmationOpen(false);
			setHistoryHelpOpen(false);
			selectHistorySession(id);
		},
		[selectHistorySession]
	);
	const selectCalendarMonth = useCallback(
		(month: Date) => onSelectCalendarMonth(sessionCalendarMonthKey(month)),
		[onSelectCalendarMonth]
	);

	const deleteSelectedSession = useCallback(async () => {
		if (await deleteHistorySession()) {
			setDeleteConfirmationOpen(false);
		}
	}, [deleteHistorySession]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const selectAdjacent = (event: KeyboardEvent, direction: 'next' | 'previous') => {
			if (
				deleteConfirmationOpen ||
				historyHelpOpen ||
				historyView === SESSION_HISTORY_VIEW.STATISTICS
			) {
				return;
			}
			event.preventDefault();
			const next = adjacentSession(navigationSummaries, selectedId, direction);
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
				if (
					historyView === SESSION_HISTORY_VIEW.STATISTICS ||
					!deleteConfirmationOpen ||
					eventTargetsInteractiveControl(event)
				) {
					return;
				}
				event.preventDefault();
				deleteSelectedSession();
			},
			deleteSession: (event) => {
				if (
					deleteConfirmationOpen ||
					historyHelpOpen ||
					historyView === SESSION_HISTORY_VIEW.STATISTICS ||
					!selected
				) {
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
		historyView,
		onClose,
		open,
		selectSession,
		selected,
		selectedId,
		navigationSummaries,
	]);

	const selectHistoryView = useCallback(
		(view: SessionHistoryView) => {
			setDeleteConfirmationOpen(false);
			setHistoryHelpOpen(false);
			setStoredHistoryView(view);
			saveSessionHistoryView(view);
			onSelectView(view);
		},
		[onSelectView]
	);
	const selectHistoryViewFromKeyboard = useCallback(
		(event: ReactKeyboardEvent<HTMLButtonElement>, view: SessionHistoryView) => {
			const currentIndex = SESSION_HISTORY_VIEW_OPTIONS.findIndex(
				(option) => option.value === view
			);
			let nextIndex: number | undefined;
			if (event.key === 'ArrowLeft') {
				nextIndex =
					(currentIndex - 1 + SESSION_HISTORY_VIEW_OPTIONS.length) %
					SESSION_HISTORY_VIEW_OPTIONS.length;
			} else if (event.key === 'ArrowRight') {
				nextIndex = (currentIndex + 1) % SESSION_HISTORY_VIEW_OPTIONS.length;
			} else if (event.key === 'Home') {
				nextIndex = 0;
			} else if (event.key === 'End') {
				nextIndex = SESSION_HISTORY_VIEW_OPTIONS.length - 1;
			}
			const nextView =
				nextIndex === undefined
					? undefined
					: SESSION_HISTORY_VIEW_OPTIONS[nextIndex]?.value;
			if (!nextView) {
				return;
			}
			event.preventDefault();
			selectHistoryView(nextView);
			event.currentTarget.ownerDocument
				.getElementById(`session-history-tab-${nextView}`)
				?.focus();
		},
		[selectHistoryView]
	);

	const selectStatisticsSession = useCallback(
		(id: string) => {
			selectHistorySession(id);
			selectHistoryView(SESSION_HISTORY_VIEW.LIST);
		},
		[selectHistorySession, selectHistoryView]
	);

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
				onSelectChartMode={setSelectedChartMode}
				onStartNew={() => onStartNew(selected)}
				selectedChartMode={selectedChartMode}
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
	} else {
		detail = (
			<div className="grid min-h-64 flex-1 place-items-center p-6 text-center">
				<div>
					<p className="font-bold text-lg">No saved sessions yet</p>
					<p className="mt-1 max-w-sm text-slate-500 text-sm">
						End a session or import a FIT or TCX file to fill your calendar and build
						ride statistics.
					</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<SideTray
				closeLabel="Close session history"
				closeOnEscape={false}
				labelledBy="session-history-title"
				onClose={onClose}
				open={open}
				panelClassName="flex max-w-6xl flex-col overflow-hidden sm:w-[min(72rem,calc(100vw-2rem))]"
			>
				<header className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-line border-b py-3 pr-24 pl-5 sm:px-5">
					<div className="mr-auto flex min-w-0 items-center gap-2">
						<h2 className="font-bold text-xl" id="session-history-title">
							Sessions
						</h2>
						<p
							aria-live="polite"
							className="max-w-xl truncate text-slate-500 text-xs"
							title={historyStatus || undefined}
						>
							{total} {total === 1 ? 'session' : 'sessions'}
							{historyStatus ? (
								<span className="text-cyan-300"> · {historyStatus}</span>
							) : null}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-1">
						<input
							accept=".fit,.tcx,.zip,application/vnd.ant.fit,application/vnd.garmin.tcx+xml,application/zip"
							className="hidden"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = '';
								if (file) {
									importActivityFile(file);
								}
							}}
							ref={importInput}
							type="file"
						/>
						<button
							className="rounded-lg border border-line px-3 py-2 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white disabled:cursor-wait disabled:opacity-60"
							disabled={transferring}
							onClick={() => importInput.current?.click()}
							type="button"
						>
							{importing ? 'Importing…' : 'Import FIT/TCX'}
						</button>
						<fieldset
							aria-label="Download all sessions"
							className="isolate m-0 inline-flex min-w-0 border-0 p-0"
							data-testid="download-all-sessions"
						>
							<button
								aria-label={`Download all sessions as ${downloadFormat.toUpperCase()}`}
								className="rounded-l-lg border border-line px-3 py-2 font-semibold text-slate-300 text-xs hover:z-10 hover:border-cyan-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
								disabled={transferring || total === 0}
								onClick={() => downloadAllActivityFiles(downloadFormat)}
								type="button"
							>
								{exporting ? 'Preparing…' : 'Download all'}
							</button>
							<select
								aria-label="Download all format"
								className="-ml-px rounded-r-lg border border-line bg-panel px-2 py-2 font-semibold text-slate-300 text-xs hover:z-10 hover:border-cyan-400/60 disabled:opacity-50"
								disabled={transferring}
								onChange={(event) => {
									const format = event.currentTarget.value;
									if (isActivityFileFormat(format)) {
										setDownloadFormat(format);
										saveSessionDownloadFormat(format);
									}
								}}
								value={downloadFormat}
							>
								<option value={ACTIVITY_FILE_FORMAT.FIT}>FIT</option>
								<option value={ACTIVITY_FILE_FORMAT.TCX}>TCX</option>
							</select>
						</fieldset>
						<button
							aria-label="Show history keyboard controls"
							className="absolute top-3 right-14 grid h-9 w-9 place-items-center rounded-lg font-bold text-slate-400 text-sm hover:bg-slate-700 hover:text-white sm:static"
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
							className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white sm:static"
							onClick={onClose}
							type="button"
						>
							×
						</button>
					</div>
				</header>
				<div
					aria-label="Session history views"
					className="flex items-end gap-5 border-line border-b bg-[#12171d] px-3 sm:px-5"
					role="tablist"
				>
					{SESSION_HISTORY_VIEW_OPTIONS.map((option) => (
						<button
							aria-controls={`session-history-panel-${option.value}`}
							aria-selected={historyView === option.value}
							className={`-mb-px border-b-2 px-1 py-3 font-semibold text-sm transition ${
								historyView === option.value
									? 'border-cyan-400 text-white'
									: 'border-transparent text-slate-400 hover:border-slate-600 hover:text-white'
							}`}
							id={`session-history-tab-${option.value}`}
							key={option.value}
							onClick={() => selectHistoryView(option.value)}
							onKeyDown={(event) =>
								selectHistoryViewFromKeyboard(event, option.value)
							}
							role="tab"
							tabIndex={historyView === option.value ? 0 : -1}
							type="button"
						>
							{option.label}
						</button>
					))}
				</div>
				<div
					aria-labelledby={`session-history-tab-${historyView}`}
					className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none md:flex-row"
					id={`session-history-panel-${historyView}`}
					role="tabpanel"
				>
					{historyView === SESSION_HISTORY_VIEW.STATISTICS ? (
						<SessionStatistics
							analytics={analytics}
							error={insightsError}
							loading={insightsLoading}
							onSelectSession={selectStatisticsSession}
							speedUnit={speedUnit}
						/>
					) : (
						<>
							{historyView === SESSION_HISTORY_VIEW.CALENDAR ? (
								<SessionCalendar
									error={insightsError}
									loading={insightsLoading}
									month={calendarMonth}
									onChangeMonth={selectCalendarMonth}
									onSelect={selectSession}
									selectedId={selectedId}
									speedUnit={speedUnit}
									summaries={calendarSummaries}
								/>
							) : (
								<SessionHistoryList
									error={error}
									highlightedSessionIds={highlightedSessionIds}
									onLoadMore={loadMore}
									onSelect={selectSession}
									open={open}
									selectedId={selectedId}
									speedUnit={speedUnit}
									summaries={summaries}
									total={total}
								/>
							)}
							{detail}
						</>
					)}
				</div>
			</SideTray>
			<KeyboardShortcutsDialog
				handleEscape={false}
				onClose={() => setHistoryHelpOpen(false)}
				open={historyHelpOpen}
				shortcuts={historyKeyboardShortcuts}
				title="History keyboard controls"
			/>
		</>
	);
}
