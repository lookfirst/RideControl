import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
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
		error,
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
	const [rendered, setRendered] = useState(open);
	const [trayVisible, setTrayVisible] = useState(open);

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

	if (!rendered) {
		return null;
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
					<SessionHistoryList
						error={error}
						onLoadMore={loadMore}
						onSelect={selectSession}
						selectedId={selectedId}
						speedUnit={speedUnit}
						summaries={summaries}
						total={total}
					/>
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
