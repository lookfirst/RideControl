import { describe, expect, test } from 'bun:test';
import { emptyMetrics, emptySession } from '../src/constants';
import {
	adjacentSession,
	createSavedSession,
	deleteSessionRecords,
	feelingLabel,
	formatSessionDateRange,
	formatSessionListTime,
	formatSessionTime,
	formatSessionTimeRange,
	groupSessionsByDate,
	normalizeSavedSession,
	requestPersistentSessionStorage,
	saveSessionRecords,
	sessionListAfterDelete,
	sessionSummary,
} from '../src/lib/saved-sessions';
import type { SavedSession, SavedSessionSummary, SessionSnapshot } from '../src/types';

const snapshot: SessionSnapshot = {
	aggregates: emptySession.aggregates,
	calories: 120,
	controlMode: 'resistance',
	distance: 10,
	elapsedSeconds: 1800,
	endedAt: new Date(2026, 6, 18, 9).getTime(),
	history: [
		{
			cadence: 85,
			elapsedSeconds: 1,
			heartRate: 140,
			power: 180,
			resistance: 42,
			speed: 30,
		},
	],
	maximums: emptyMetrics,
	startedAt: new Date(2026, 6, 18, 8, 30).getTime(),
};

describe('saved session utilities', () => {
	test('formats recorded and missing session feelings', () => {
		expect(feelingLabel('great')).toBe('Great');
		expect(feelingLabel()).toBe('Not recorded');
	});

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
		expect(session.history[0]?.resistance).toBe(42);
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

	test('writes and deletes both full and summary session records', () => {
		const session = createSavedSession(snapshot, { comments: '' }, 1234, 'session-1');
		const writes = new Map<string, unknown[]>();
		saveSessionRecords(
			(name) =>
				({
					put: (value: unknown) => {
						writes.set(name, [...(writes.get(name) ?? []), value]);
						return {} as IDBRequest<IDBValidKey>;
					},
				}) as Pick<IDBObjectStore, 'put'>,
			session
		);
		expect(writes.get('sessions')).toEqual([session]);
		const summaryRecord = writes.get('session-summaries')?.[0];
		expect(summaryRecord).toEqual(sessionSummary(session));
		expect('history' in (summaryRecord as Record<string, unknown>)).toBe(false);

		const deletions = new Map<string, IDBValidKey[]>();
		deleteSessionRecords(
			(name) =>
				({
					delete: (key: IDBValidKey) => {
						deletions.set(name, [...(deletions.get(name) ?? []), key]);
						return {} as IDBRequest<undefined>;
					},
				}) as Pick<IDBObjectStore, 'delete'>,
			'session-1'
		);
		expect(deletions).toEqual(
			new Map([
				['sessions', ['session-1']],
				['session-summaries', ['session-1']],
			])
		);
	});

	test('restores resistance aggregates for legacy saved sessions', () => {
		const session = createSavedSession(snapshot, { comments: '' }, 1234, 'legacy');
		const legacy = {
			...session,
			aggregates: {
				cadence: session.aggregates.cadence,
				heartRate: session.aggregates.heartRate,
				power: session.aggregates.power,
			},
		} as unknown as SavedSession;
		expect(normalizeSavedSession(legacy).aggregates.resistance).toEqual({
			count: 1,
			sum: 42,
		});
		expect(normalizeSavedSession(session).aggregates.resistance).toBe(
			session.aggregates.resistance
		);
	});

	test('restores gear aggregates for virtual shifting sessions', () => {
		const gearSession = {
			...createSavedSession(snapshot, { comments: '' }, 1234, 'gears'),
			aggregates: {
				...snapshot.aggregates,
				gear: undefined,
			},
			controlMode: 'gear',
			history: [
				{
					cadence: 85,
					elapsedSeconds: 1,
					gear: 14,
					heartRate: 140,
					power: 180,
					speed: 30,
				},
			],
		} as unknown as SavedSession;
		const normalized = normalizeSavedSession(gearSession);
		expect(normalized.controlMode).toBe('gear');
		expect(normalized.aggregates.gear).toEqual({ count: 1, sum: 14 });
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

	test('groups overnight sessions by their complete local date range', () => {
		const overnightStart = new Date(2026, 6, 18, 23).getTime();
		const overnightEnd = new Date(2026, 6, 19, 1).getTime();
		const daytimeStart = new Date(2026, 6, 18, 9).getTime();
		const summaries = [
			{
				calories: 0,
				distance: 0,
				elapsedSeconds: 7200,
				endedAt: overnightEnd,
				id: 'overnight',
				startedAt: overnightStart,
			},
			{
				calories: 0,
				distance: 0,
				elapsedSeconds: 3600,
				endedAt: daytimeStart + 3_600_000,
				id: 'daytime',
				startedAt: daytimeStart,
			},
		] satisfies SavedSessionSummary[];
		const groups = groupSessionsByDate(summaries);
		expect(groups).toHaveLength(2);
		expect(groups[0]).toMatchObject({
			date: new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).formatRange(
				new Date(overnightStart),
				new Date(overnightEnd)
			),
			key: '2026-7-18/2026-7-19',
		});
		expect(groups[0]?.sessions[0]?.id).toBe('overnight');
		expect(groups[1]?.sessions[0]?.id).toBe('daytime');
	});

	test('selects the nearest remaining session after deletion', () => {
		const sessions = ['one', 'two', 'three'].map(
			(id, index) =>
				({
					calories: 0,
					distance: 0,
					elapsedSeconds: 0,
					endedAt: index,
					id,
					startedAt: index,
				}) satisfies SavedSessionSummary
		);
		expect(sessionListAfterDelete(sessions, 'two')).toEqual({
			next: sessions[2],
			sessions: [sessions[0], sessions[2]],
		});
		expect(sessionListAfterDelete(sessions, 'three').next).toBe(sessions[1]);
		expect(sessionListAfterDelete([sessions[0]], 'one')).toEqual({ sessions: [] });
		expect(sessionListAfterDelete(sessions, 'missing')).toEqual({
			next: sessions[0],
			sessions,
		});
	});

	test('selects adjacent sessions without wrapping at the list boundaries', () => {
		const sessions = ['newest', 'middle', 'oldest'].map(
			(id, index) =>
				({
					calories: 0,
					distance: 0,
					elapsedSeconds: 0,
					endedAt: index,
					id,
					startedAt: index,
				}) satisfies SavedSessionSummary
		);
		expect(adjacentSession(sessions, 'middle', 'previous')).toBe(sessions[0]);
		expect(adjacentSession(sessions, 'middle', 'next')).toBe(sessions[2]);
		expect(adjacentSession(sessions, 'newest', 'previous')).toBeUndefined();
		expect(adjacentSession(sessions, 'oldest', 'next')).toBeUndefined();
		expect(adjacentSession(sessions, undefined, 'next')).toBe(sessions[0]);
	});

	test('formats a timestamp as a readable time', () => {
		expect(formatSessionTime(snapshot.startedAt)).toBe('8:30am');
	});

	test('shows an end time only when recorded time exists', () => {
		expect(formatSessionTimeRange(snapshot)).toBe('8:30am – 9:00am');
		expect(formatSessionTimeRange({ ...snapshot, elapsedSeconds: 0 })).toBe('8:30am');
		expect(formatSessionTimeRange({ ...snapshot, endedAt: snapshot.startedAt })).toBe('8:30am');
	});

	test('shows date and time ranges for overnight sessions', () => {
		const overnight = {
			elapsedSeconds: 7200,
			endedAt: new Date(2026, 6, 19, 1).getTime(),
			startedAt: new Date(2026, 6, 18, 23).getTime(),
		};
		const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
		expect(formatSessionDateRange(overnight)).toBe(
			dateFormatter.formatRange(new Date(overnight.startedAt), new Date(overnight.endedAt))
		);
		expect(formatSessionListTime(overnight)).toBe('11:00pm – 1:00am');
		expect(formatSessionListTime(snapshot)).toBe('8:30am');
		expect(formatSessionDateRange({ ...overnight, elapsedSeconds: 0 })).toBe(
			dateFormatter.format(overnight.startedAt)
		);
	});

	test('requests persistent storage only when needed and supported', async () => {
		const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
		try {
			Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
			expect(await requestPersistentSessionStorage()).toBe(false);

			let persistCalls = 0;
			Object.defineProperty(navigator, 'storage', {
				configurable: true,
				value: {
					persist: () => {
						persistCalls += 1;
						return Promise.resolve(true);
					},
					persisted: () => Promise.resolve(true),
				},
			});
			expect(await requestPersistentSessionStorage()).toBe(true);
			expect(persistCalls).toBe(0);

			Object.defineProperty(navigator, 'storage', {
				configurable: true,
				value: {
					persist: () => {
						persistCalls += 1;
						return Promise.resolve(false);
					},
					persisted: () => Promise.resolve(false),
				},
			});
			expect(await requestPersistentSessionStorage()).toBe(false);
			expect(persistCalls).toBe(1);
		} finally {
			if (original) {
				Object.defineProperty(navigator, 'storage', original);
			} else {
				Reflect.deleteProperty(navigator, 'storage');
			}
		}
	});
});
