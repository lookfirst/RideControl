import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';
import {
	countSavedSessions,
	deleteSavedSession,
	getSavedSession,
	listAllSavedSessions,
	listSavedSessions,
	sessionListAfterDelete,
} from '../lib/saved-sessions';
import { downloadSessionTcxArchive } from '../lib/tcx-archive';
import { importTcxUpload, tcxImportResultMessage } from '../lib/tcx-import';
import type { SavedSession, SavedSessionSummary } from '../types';

const PAGE_SIZE = 30;

export function useSessionHistory(open: boolean) {
	const [summaries, setSummaries] = useState<SavedSessionSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [selected, setSelected] = useState<SavedSession>();
	const [selectedId, setSelectedId] = useState<string>();
	const [loading, setLoading] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [importing, setImporting] = useState(false);
	const [historyStatus, setHistoryStatus] = useState('');
	const [highlightedSessionIds, setHighlightedSessionIds] = useState<string[]>([]);
	const [error, setError] = useState('');
	const deleteInProgress = useRef(false);
	const historyLoadGeneration = useRef(0);

	const selectSession = useCallback(async (id: string) => {
		setSelectedId(id);
		setLoading(true);
		try {
			setSelected(await getSavedSession(id));
			setError('');
		} catch (loadError) {
			setError(errorMessage(loadError));
		} finally {
			setLoading(false);
		}
	}, []);

	const loadHistory = useCallback(
		async (preferredSessionId?: string, includeAll = false) => {
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
			setError('');
			const nextSessionId = preferredSessionId ?? sessions[0]?.id;
			if (nextSessionId) {
				await selectSession(nextSessionId);
			} else {
				setSelected(undefined);
				setSelectedId(undefined);
			}
		},
		[selectSession]
	);

	useEffect(() => {
		if (!open) {
			historyLoadGeneration.current += 1;
			setHistoryStatus('');
			setHighlightedSessionIds([]);
			return;
		}
		loadHistory().catch((loadError: unknown) => setError(errorMessage(loadError)));
	}, [loadHistory, open]);

	const importTcxFile = useCallback(
		async (file: File) => {
			setImporting(true);
			setHistoryStatus('');
			setHighlightedSessionIds([]);
			try {
				const result = await importTcxUpload(file);
				setHistoryStatus(tcxImportResultMessage(result));
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

	const downloadAllTcx = useCallback(async () => {
		setExporting(true);
		setHistoryStatus('');
		try {
			const sessions = await listAllSavedSessions();
			await downloadSessionTcxArchive(sessions);
			setHistoryStatus(
				`Downloaded ${sessions.length} TCX ${sessions.length === 1 ? 'file' : 'files'} in one ZIP`
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
			setError('');
			if (updated.next) {
				await selectSession(updated.next.id);
			} else {
				setSelected(undefined);
				setSelectedId(undefined);
			}
			return true;
		} catch (deleteError) {
			setError(errorMessage(deleteError));
			return false;
		} finally {
			deleteInProgress.current = false;
			setDeleting(false);
		}
	}, [selected, selectSession, summaries]);

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
		downloadAllTcx,
		error,
		exporting,
		highlightedSessionIds,
		historyStatus,
		importing,
		importTcxFile,
		loading,
		loadMore,
		selected,
		selectedId,
		selectSession,
		summaries,
		total,
	};
}
