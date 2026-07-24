import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { getSessionAnalytics, listSavedSessionsForMonth } from '../lib/saved-sessions';
import { emptySessionAnalyticsCache } from '../lib/session-analytics';
import type { SavedSessionSummary } from '../types';

export function useSessionInsights(open: boolean, month: Date, revision: number) {
	const [analytics, setAnalytics] = useState(emptySessionAnalyticsCache);
	const [calendarSummaries, setCalendarSummaries] = useState<SavedSessionSummary[]>([]);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const generation = useRef(0);
	const loadedRevision = useRef(-1);
	const year = month.getFullYear();
	const monthIndex = month.getMonth();

	useEffect(() => {
		if (!open) {
			generation.current += 1;
			return;
		}
		const currentGeneration = generation.current + 1;
		generation.current = currentGeneration;
		loadedRevision.current = revision;
		setLoading(true);
		Promise.all([listSavedSessionsForMonth(year, monthIndex), getSessionAnalytics()])
			.then(([summaries, storedAnalytics]) => {
				if (
					generation.current !== currentGeneration ||
					loadedRevision.current !== revision
				) {
					return;
				}
				setCalendarSummaries(summaries);
				setAnalytics(storedAnalytics);
				setError('');
			})
			.catch((loadError: unknown) => {
				if (
					generation.current === currentGeneration &&
					loadedRevision.current === revision
				) {
					setError(errorMessage(loadError));
				}
			})
			.finally(() => {
				if (
					generation.current === currentGeneration &&
					loadedRevision.current === revision
				) {
					setLoading(false);
				}
			});
	}, [monthIndex, open, revision, year]);

	return { analytics, calendarSummaries, error, loading };
}
