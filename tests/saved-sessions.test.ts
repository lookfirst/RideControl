import { describe, expect, test } from 'bun:test';
import { emptyMetrics, emptySession } from '../src/constants';
import {
	createSavedSession,
	formatSessionTime,
	groupSessionsByDate,
	sessionSummary,
} from '../src/lib/saved-sessions';
import type { SavedSessionSummary, SessionSnapshot } from '../src/types';

const snapshot: SessionSnapshot = {
	aggregates: emptySession.aggregates,
	calories: 120,
	distance: 10,
	elapsedSeconds: 1800,
	history: [],
	maximums: emptyMetrics,
	startedAt: new Date(2026, 6, 18, 8, 30).getTime(),
};

describe('saved session utilities', () => {
	test('creates a saved session with trimmed metadata', () => {
		const session = createSavedSession(
			snapshot,
			{ comments: '  Strong finish.  ', feeling: 'good' },
			1234,
			'session-1'
		);
		expect(session).toMatchObject({
			comments: 'Strong finish.',
			endedAt: 1234,
			feeling: 'good',
			id: 'session-1',
		});
		expect(session.distance).toBe(10);
	});

	test('creates a lightweight summary without sample history', () => {
		const session = createSavedSession(snapshot, { comments: '' }, 1234, 'session-1');
		const summary = sessionSummary(session);
		expect(summary).toEqual({
			calories: 120,
			distance: 10,
			elapsedSeconds: 1800,
			endedAt: 1234,
			feeling: undefined,
			id: 'session-1',
			startedAt: snapshot.startedAt,
		});
		expect('history' in summary).toBe(false);
	});

	test('groups ordered summaries by their local calendar date', () => {
		const summaries = [
			{ id: 'one', startedAt: new Date(2026, 6, 18, 9).getTime() },
			{ id: 'two', startedAt: new Date(2026, 6, 18, 7).getTime() },
			{ id: 'three', startedAt: new Date(2026, 6, 17, 18).getTime() },
		].map(
			(item) =>
				({
					...item,
					calories: 0,
					distance: 0,
					elapsedSeconds: 1,
					endedAt: item.startedAt + 1000,
				}) satisfies SavedSessionSummary
		);
		const groups = groupSessionsByDate(summaries);
		expect(groups).toHaveLength(2);
		expect(groups[0].sessions.map((session) => session.id)).toEqual(['one', 'two']);
		expect(groups[1]?.sessions[0]?.id).toBe('three');
	});

	test('formats a timestamp as a readable time', () => {
		expect(formatSessionTime(snapshot.startedAt)).not.toBe('');
	});
});
