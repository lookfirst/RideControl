import { describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import {
	deleteSavedSession,
	getSessionAnalytics,
	listSavedSessionsForMonth,
	saveSession,
	sessionSummary,
} from '../src/lib/saved-sessions';
import { savedSessionFixture } from './fixtures/saved-session';

const DATABASE_NAME = 'ridecontrol-sessions';
const LEGACY_DATABASE_VERSION = 3;

function requestCompleted(request: IDBRequest | IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		request.addEventListener('success', () => resolve(), { once: true });
		request.addEventListener('complete', () => resolve(), { once: true });
		request.addEventListener('error', () => reject(request.error), { once: true });
		request.addEventListener('abort', () => reject((request as IDBTransaction).error), {
			once: true,
		});
	});
}

async function createLegacySessionDatabase(): Promise<void> {
	await requestCompleted(indexedDB.deleteDatabase(DATABASE_NAME));
	const openRequest = indexedDB.open(DATABASE_NAME, LEGACY_DATABASE_VERSION);
	openRequest.addEventListener(
		'upgradeneeded',
		() => {
			const sessions = openRequest.result.createObjectStore('sessions', { keyPath: 'id' });
			sessions.createIndex('workoutSnapshotId', 'workoutSnapshotId');
			const summaries = openRequest.result.createObjectStore('session-summaries', {
				keyPath: 'id',
			});
			summaries.createIndex('endedAt', 'endedAt');
			openRequest.result.createObjectStore('session-workouts', { keyPath: 'id' });
			openRequest.result.createObjectStore('active-session', { keyPath: 'id' });
			openRequest.result.createObjectStore('active-session-samples', { keyPath: 'id' });
		},
		{ once: true }
	);
	await requestCompleted(openRequest);
	const database = openRequest.result;
	const transaction = database.transaction(['sessions', 'session-summaries'], 'readwrite');
	transaction.objectStore('sessions').put(savedSessionFixture);
	transaction.objectStore('session-summaries').put(sessionSummary(savedSessionFixture));
	await requestCompleted(transaction);
	database.close();
}

describe('session analytics IndexedDB cache', () => {
	test('backfills legacy rides and incrementally handles replacement and deletion', async () => {
		await createLegacySessionDatabase();

		const migrated = await getSessionAnalytics();
		expect(migrated.totals.sessionCount).toBe(1);
		expect(migrated.totals.distance).toBe(savedSessionFixture.distance);
		expect(
			await listSavedSessionsForMonth(
				new Date(savedSessionFixture.startedAt).getFullYear(),
				new Date(savedSessionFixture.startedAt).getMonth()
			)
		).toHaveLength(1);

		const replacement = {
			...savedSessionFixture,
			distance: 10,
			elevationTotals: { ascent: 500, descent: 450 },
		};
		await saveSession(replacement);
		const afterReplacement = await getSessionAnalytics();
		expect(afterReplacement.totals.sessionCount).toBe(1);
		expect(afterReplacement.totals.distance).toBe(10);
		expect(afterReplacement.totals.ascent).toBe(500);

		const second = {
			...savedSessionFixture,
			distance: 20,
			elapsedSeconds: 7200,
			endedAt: new Date(2026, 7, 1, 1).getTime(),
			id: 'second-session',
			startedAt: new Date(2026, 6, 31, 23).getTime(),
		};
		await saveSession(second);
		const afterAddition = await getSessionAnalytics();
		expect(afterAddition.totals.sessionCount).toBe(2);
		expect(afterAddition.totals.distance).toBe(30);
		expect(await listSavedSessionsForMonth(2026, 7)).toHaveLength(1);

		await deleteSavedSession(replacement.id);
		const afterDelete = await getSessionAnalytics();
		expect(afterDelete.totals.sessionCount).toBe(1);
		expect(afterDelete.totals.distance).toBe(20);
		expect(afterDelete.peaks.distance).toEqual({
			sessionId: second.id,
			value: second.distance,
		});
	});
});
