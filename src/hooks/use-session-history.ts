import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_FILE_FORMAT, type ActivityFileFormat } from '../lib/activity-file';
import { activityImportResultMessage, importActivityUpload } from '../lib/activity-import';
import { errorMessage } from '../lib/errors';
import { downloadSessionFitArchive } from '../lib/fit-archive';
import {
	countSavedSessions,
	deleteSavedSession,
	getSavedSession,
	listAllSavedSessions,
	listSavedSessions,
	sessionListAfterDelete,
} from '../lib/saved-sessions';
import { loadSelectedSessionId, saveSelectedSessionId } from '../lib/session-history-preferences';
import { downloadSessionTcxArchive } from '../lib/tcx-archive';
import type { SavedSession, SavedSessionSummary } from '../types';

const PAGE_SIZE = 30;

export function useSessionHistory(open: boolean, preferredSessionId?: string) {
	const [summaries, setSummaries] = useState<SavedSessionSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [selected, setSelected] = useState<SavedSession>();
	const [selectedId, setSelectedId] = useState(
		() => preferredSessionId ?? loadSelectedSessionId()
	);
	const selectedIdRef = useRef(selectedId);
	const [loading, setLoading] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [importing, setImporting] = useState(false);
	const [historyStatus, setHistoryStatus] = useState('');
	const [highlightedSessionIds, setHighlightedSessionIds] = useState<string[]>([]);
	const [error, setError] = useState('');
	const [revision, setRevision] = useState(0);
	const deleteInProgress = useRef(false);
	const historyLoadGeneration = useRef(0);
	const historyInitialized = useRef(false);

	const rememberSelectedSession = useCallback((id: string | undefined) => {
		selectedIdRef.current = id;
		setSelectedId(id);
		saveSelectedSessionId(id);
	}, []);

	const selectSession = useCallback(
		async (id: string) => {
			rememberSelectedSession(id);
			setLoading(true);
			try {
				setSelected(await getSavedSession(id));
				setError('');
			} catch (loadError) {
				setError(errorMessage(loadError));
			} finally {
				setLoading(false);
			}
		},
		[rememberSelectedSession]
	);

	const loadHistory = useCallback(
		async (requestedSessionId?: string, includeAll = false) => {
			const generation = historyLoadGeneration.current + 1;
			historyLoadGeneration.current = generation;
			const [sessions, count] = await Promise.all([
				listSavedSessions(includeAll ? Number.MAX_SAFE_INTEGER : PAGE_SIZE),
				countSavedSessions(),
			]);
			if (generation !== historyLoadGeneration.current) {
				return;
			}
			setSummaries(sessions);
			setTotal(count);
			setRevision((current) => current + 1);
			setError('');
			const nextSessionId = sessions.some((session) => session.id === requestedSessionId)
				? requestedSessionId
				: sessions[0]?.id;
			if (nextSessionId) {
				await selectSession(nextSessionId);
			} else {
				setSelected(undefined);
				rememberSelectedSession(undefined);
			}
		},
		[rememberSelectedSession, selectSession]
	);

	useEffect(() => {
		if (!open) {
			historyLoadGeneration.current += 1;
			historyInitialized.current = false;
			setHistoryStatus('');
			setHighlightedSessionIds([]);
			return;
		}
		if (
			historyInitialized.current &&
			(!preferredSessionId || preferredSessionId === selectedIdRef.current)
		) {
			return;
		}
		const requestedSessionId = preferredSessionId ?? selectedIdRef.current;
		loadHistory(requestedSessionId, requestedSessionId !== undefined)
			.then(() => {
				historyInitialized.current = true;
			})
			.catch((loadError: unknown) => setError(errorMessage(loadError)));
	}, [loadHistory, open, preferredSessionId]);

	const importActivityFile = useCallback(
		async (file: File) => {
			setImporting(true);
			setHistoryStatus('');
			setHighlightedSessionIds([]);
			try {
				const result = await importActivityUpload(file);
				setHistoryStatus(activityImportResultMessage(result));
				setHighlightedSessionIds(result.importedSessions.map((session) => session.id));
				const newestImported = result.importedSessions.reduce<SavedSession | undefined>(
					(newest, session) =>
						!newest || session.endedAt > newest.endedAt ? session : newest,
					undefined
				);
				if (newestImported) {
					await loadHistory(newestImported.id, true);
				}
				setError('');
			} catch (importError) {
				setError(errorMessage(importError));
			} finally {
				setImporting(false);
			}
		},
		[loadHistory]
	);

	const downloadAllActivityFiles = useCallback(async (format: ActivityFileFormat) => {
		setExporting(true);
		setHistoryStatus('');
		try {
			const sessions = await listAllSavedSessions();
			if (format === ACTIVITY_FILE_FORMAT.FIT) {
				await downloadSessionFitArchive(sessions);
			} else {
				await downloadSessionTcxArchive(sessions);
			}
			const label = format.toUpperCase();
			setHistoryStatus(
				`Downloaded ${sessions.length} ${label} ${sessions.length === 1 ? 'file' : 'files'} in one ZIP`
			);
			setError('');
		} catch (downloadError) {
			setError(errorMessage(downloadError));
		} finally {
			setExporting(false);
		}
	}, []);

	const deleteSelectedSession = useCallback(async () => {
		if (!selected || deleteInProgress.current) {
			return false;
		}
		deleteInProgress.current = true;
		setDeleting(true);
		try {
			await deleteSavedSession(selected.id);
			setHighlightedSessionIds((current) => current.filter((id) => id !== selected.id));
			const updated = sessionListAfterDelete(summaries, selected.id);
			setSummaries(updated.sessions);
			setTotal((current) => Math.max(0, current - 1));
			setRevision((current) => current + 1);
			setError('');
			if (updated.next) {
				await selectSession(updated.next.id);
			} else {
				setSelected(undefined);
				rememberSelectedSession(undefined);
			}
			return true;
		} catch (deleteError) {
			setError(errorMessage(deleteError));
			return false;
		} finally {
			deleteInProgress.current = false;
			setDeleting(false);
		}
	}, [rememberSelectedSession, selected, selectSession, summaries]);

	const loadMore = useCallback(async () => {
		const last = summaries.at(-1);
		if (!last) {
			return;
		}
		try {
			const more = await listSavedSessions(PAGE_SIZE, last.endedAt);
			setSummaries((current) => [...current, ...more]);
			setError('');
		} catch (loadError) {
			setError(errorMessage(loadError));
		}
	}, [summaries]);

	return {
		deleteSelectedSession,
		deleting,
		downloadAllActivityFiles,
		error,
		exporting,
		highlightedSessionIds,
		historyStatus,
		importActivityFile,
		importing,
		loading,
		loadMore,
		revision,
		selected,
		selectedId,
		selectSession,
		summaries,
		total,
	};
}
