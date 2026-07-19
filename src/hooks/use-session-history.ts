import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';
import {
	countSavedSessions,
	deleteSavedSession,
	getSavedSession,
	listSavedSessions,
	sessionListAfterDelete,
} from '../lib/saved-sessions';
import type { SavedSession, SavedSessionSummary } from '../types';

const PAGE_SIZE = 30;

export function useSessionHistory(open: boolean) {
	const [summaries, setSummaries] = useState<SavedSessionSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [selected, setSelected] = useState<SavedSession>();
	const [selectedId, setSelectedId] = useState<string>();
	const [loading, setLoading] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState('');
	const deleteInProgress = useRef(false);

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
				setError(errorMessage(loadError));
			}
		});
		return () => {
			cancelled = true;
		};
	}, [open, selectSession]);

	const deleteSelectedSession = useCallback(async () => {
		if (!selected || deleteInProgress.current) {
			return false;
		}
		deleteInProgress.current = true;
		setDeleting(true);
		try {
			await deleteSavedSession(selected.id);
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
		error,
		loading,
		loadMore,
		selected,
		selectedId,
		selectSession,
		summaries,
		total,
	};
}
