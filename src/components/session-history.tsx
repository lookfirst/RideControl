import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionHistory } from '../hooks/use-session-history';
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
import type { SavedSession, SpeedUnit } from '../types';
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import { SessionDetail } from './session-detail';
import { SessionHistoryList } from './session-history-list';
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
	onStartNew,
	open,
	speedUnit,
}: {
	onClose: () => void;
	onStartNew: (session: SavedSession) => void;
	open: boolean;
	speedUnit: SpeedUnit;
}) {
	const {
		deleteSelectedSession: deleteHistorySession,
		deleting,
		downloadAllTcx,
		error,
		exporting,
		historyStatus,
		highlightedSessionIds,
		importTcxFile,
		importing,
		loading,
		loadMore,
		selected,
		selectedId,
		selectSession: selectHistorySession,
		summaries,
		total,
	} = useSessionHistory(open);
	const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
	const [historyHelpOpen, setHistoryHelpOpen] = useState(false);
	const importInput = useRef<HTMLInputElement>(null);
	const transferring = exporting || importing;

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
				if (!deleteConfirmationOpen || eventTargetsInteractiveControl(event)) {
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
		<>
			<SideTray
				closeLabel="Close session history"
				closeOnEscape={false}
				labelledBy="session-history-title"
				onClose={onClose}
				open={open}
				panelClassName="flex max-w-6xl flex-col overflow-hidden sm:w-[min(72rem,calc(100vw-2rem))]"
			>
				<header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-line border-b px-5 py-3">
					<div className="mr-auto min-w-0">
						<h2 className="font-bold text-xl" id="session-history-title">
							Session history
						</h2>
						<p
							aria-live="polite"
							className="mt-0.5 max-w-xl truncate text-slate-500 text-xs"
							title={historyStatus || undefined}
						>
							Saved on this device · {total} {total === 1 ? 'session' : 'sessions'}
							{historyStatus ? (
								<span className="text-cyan-300"> · {historyStatus}</span>
							) : null}
						</p>
					</div>
					<div className="flex items-center gap-1">
						<input
							accept=".tcx,.zip,application/vnd.garmin.tcx+xml,application/zip"
							className="hidden"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = '';
								if (file) {
									importTcxFile(file);
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
							{importing ? 'Importing…' : 'Import TCX'}
						</button>
						<button
							className="rounded-lg border border-line px-3 py-2 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
							disabled={transferring || total === 0}
							onClick={downloadAllTcx}
							type="button"
						>
							{exporting ? 'Preparing…' : 'Download all'}
						</button>
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
					<SessionHistoryList
						error={error}
						highlightedSessionIds={highlightedSessionIds}
						onLoadMore={loadMore}
						onSelect={selectSession}
						selectedId={selectedId}
						speedUnit={speedUnit}
						summaries={summaries}
						total={total}
					/>
					{detail}
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
