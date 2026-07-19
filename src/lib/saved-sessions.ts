import type {
	SavedSession,
	SavedSessionSummary,
	SessionFeeling,
	SessionMetadata,
	SessionSnapshot,
} from '../types';
import {
	aggregateGear,
	aggregateResistance,
	controlModeForHistory,
	restoreAggregate,
} from './session';
import { IMPORTED_TCX_ID_PREFIX } from './tcx-schema';
import { isFiniteNumber } from './type-guards';

const DATABASE_NAME = 'ridecontrol-sessions';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'sessions';
const SUMMARY_STORE = 'session-summaries';
const ENDED_AT_INDEX = 'endedAt';
const MERIDIEM_SUFFIX = /\s*(AM|PM)$/i;
const SESSION_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
const SESSION_IMPORT_FORMATTER = new Intl.DateTimeFormat(undefined, {
	dateStyle: 'medium',
	timeStyle: 'short',
});

export const SESSION_FEELING_OPTIONS: { label: string; value: SessionFeeling }[] = [
	{ label: 'Great', value: 'great' },
	{ label: 'Good', value: 'good' },
	{ label: 'Okay', value: 'okay' },
	{ label: 'Tough', value: 'tough' },
	{ label: 'Exhausted', value: 'exhausted' },
];

type SessionTiming = Pick<SavedSessionSummary, 'elapsedSeconds' | 'endedAt' | 'startedAt'>;

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.addEventListener('success', () => resolve(request.result), { once: true });
		request.addEventListener('error', () => reject(request.error), { once: true });
	});
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.addEventListener('complete', () => resolve(), { once: true });
		transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
		transaction.addEventListener('error', () => reject(transaction.error), { once: true });
	});
}

function openDatabase(): Promise<IDBDatabase> {
	if (databasePromise) {
		return databasePromise;
	}
	databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.addEventListener(
			'upgradeneeded',
			() => {
				const database = request.result;
				if (!database.objectStoreNames.contains(SESSION_STORE)) {
					database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
				}
				if (!database.objectStoreNames.contains(SUMMARY_STORE)) {
					const summaries = database.createObjectStore(SUMMARY_STORE, { keyPath: 'id' });
					summaries.createIndex(ENDED_AT_INDEX, ENDED_AT_INDEX);
				}
			},
			{ once: true }
		);
		request.addEventListener('success', () => resolve(request.result), { once: true });
		request.addEventListener('error', () => reject(request.error), { once: true });
	});
	return databasePromise;
}

export function createSavedSession(
	snapshot: SessionSnapshot,
	metadata: SessionMetadata,
	endedAt = snapshot.endedAt || Date.now(),
	id: string = crypto.randomUUID()
): SavedSession {
	return {
		...snapshot,
		comments: metadata.comments.trim(),
		endedAt,
		feeling: metadata.feeling,
		id,
	};
}

export function feelingLabel(feeling?: SessionFeeling): string {
	if (!feeling) {
		return 'Not recorded';
	}
	return feeling[0].toUpperCase() + feeling.slice(1);
}

export function sessionSummary(session: SavedSession): SavedSessionSummary {
	return {
		calories: session.calories,
		distance: session.distance,
		elapsedSeconds: session.elapsedSeconds,
		endedAt: session.endedAt,
		feeling: session.feeling,
		id: session.id,
		...(session.importedAt === undefined ? {} : { importedAt: session.importedAt }),
		startedAt: session.startedAt,
	};
}

function normalizedImportedAt(importedAt: unknown): number | undefined {
	return isFiniteNumber(importedAt) && importedAt >= 0 ? importedAt : undefined;
}

export function normalizeSavedSessionSummary(session: SavedSessionSummary): SavedSessionSummary {
	return { ...session, importedAt: normalizedImportedAt(session.importedAt) };
}

export function isImportedSession(
	session: Pick<SavedSessionSummary, 'id' | 'importedAt'>
): boolean {
	return session.importedAt !== undefined || session.id.startsWith(IMPORTED_TCX_ID_PREFIX);
}

type StoreGetter<T> = (name: string) => T;

export function saveSessionRecords(
	getStore: StoreGetter<Pick<IDBObjectStore, 'put'>>,
	session: SavedSession
): void {
	getStore(SESSION_STORE).put(session);
	getStore(SUMMARY_STORE).put(sessionSummary(session));
}

export function deleteSessionRecords(
	getStore: StoreGetter<Pick<IDBObjectStore, 'delete'>>,
	id: string
): void {
	getStore(SESSION_STORE).delete(id);
	getStore(SUMMARY_STORE).delete(id);
}

export async function saveSession(session: SavedSession): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction([SESSION_STORE, SUMMARY_STORE], 'readwrite');
	const completed = transactionComplete(transaction);
	saveSessionRecords((name) => transaction.objectStore(name), session);
	await completed;
}

export async function deleteSavedSession(id: string): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction([SESSION_STORE, SUMMARY_STORE], 'readwrite');
	const completed = transactionComplete(transaction);
	deleteSessionRecords((name) => transaction.objectStore(name), id);
	await completed;
}

export async function getSavedSession(id: string): Promise<SavedSession | undefined> {
	const database = await openDatabase();
	const transaction = database.transaction(SESSION_STORE, 'readonly');
	const completed = transactionComplete(transaction);
	const session = await requestResult(
		transaction.objectStore(SESSION_STORE).get(id) as IDBRequest<SavedSession | undefined>
	);
	await completed;
	if (!session) {
		return;
	}
	return normalizeSavedSession(session);
}

export function normalizeSavedSession(session: SavedSession): SavedSession {
	return {
		...session,
		aggregates: {
			...session.aggregates,
			gear: restoreAggregate(
				(session.aggregates as Partial<SavedSession['aggregates']>).gear,
				aggregateGear(session.history)
			),
			resistance: restoreAggregate(
				(session.aggregates as Partial<SavedSession['aggregates']>).resistance,
				aggregateResistance(session.history)
			),
		},
		controlMode: controlModeForHistory(session.history, session.controlMode),
		importedAt: normalizedImportedAt(session.importedAt),
	};
}

export async function countSavedSessions(): Promise<number> {
	const database = await openDatabase();
	const transaction = database.transaction(SUMMARY_STORE, 'readonly');
	const completed = transactionComplete(transaction);
	const count = await requestResult(transaction.objectStore(SUMMARY_STORE).count());
	await completed;
	return count;
}

export async function listSavedSessions(
	limit = 30,
	beforeEndedAt?: number
): Promise<SavedSessionSummary[]> {
	const database = await openDatabase();
	const transaction = database.transaction(SUMMARY_STORE, 'readonly');
	const completed = transactionComplete(transaction);
	const index = transaction.objectStore(SUMMARY_STORE).index(ENDED_AT_INDEX);
	const range =
		beforeEndedAt === undefined ? undefined : IDBKeyRange.upperBound(beforeEndedAt, true);
	const summaries: SavedSessionSummary[] = [];
	await new Promise<void>((resolve, reject) => {
		const request = index.openCursor(range, 'prev');
		request.addEventListener('error', () => reject(request.error), { once: true });
		request.addEventListener('success', () => {
			const cursor = request.result;
			if (!cursor || summaries.length >= limit) {
				resolve();
				return;
			}
			summaries.push(normalizeSavedSessionSummary(cursor.value as SavedSessionSummary));
			cursor.continue();
		});
	});
	await completed;
	return summaries;
}

export async function listAllSavedSessions(): Promise<SavedSession[]> {
	const database = await openDatabase();
	const transaction = database.transaction(SESSION_STORE, 'readonly');
	const completed = transactionComplete(transaction);
	const sessions = await requestResult(
		transaction.objectStore(SESSION_STORE).getAll() as IDBRequest<SavedSession[]>
	);
	await completed;
	return sessions.map(normalizeSavedSession).sort((left, right) => right.endedAt - left.endedAt);
}

export interface SessionGroup {
	date: string;
	key: string;
	sessions: SavedSessionSummary[];
}

function localDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function hasRecordedSessionEnd(session: SessionTiming): boolean {
	return session.elapsedSeconds > 0 && session.endedAt > session.startedAt;
}

function sessionSpansDates(session: SessionTiming): boolean {
	return (
		hasRecordedSessionEnd(session) &&
		localDateKey(session.startedAt) !== localDateKey(session.endedAt)
	);
}

export function formatSessionDateRange(session: SessionTiming): string {
	const started = new Date(session.startedAt);
	if (!sessionSpansDates(session)) {
		return SESSION_DATE_FORMATTER.format(started);
	}
	return SESSION_DATE_FORMATTER.formatRange(started, new Date(session.endedAt));
}

function sessionDateGroupKey(session: SessionTiming): string {
	const started = localDateKey(session.startedAt);
	return sessionSpansDates(session) ? `${started}/${localDateKey(session.endedAt)}` : started;
}

export function groupSessionsByDate(sessions: SavedSessionSummary[]): SessionGroup[] {
	const groups = new Map<string, SessionGroup>();
	for (const session of sessions) {
		const key = sessionDateGroupKey(session);
		const existing = groups.get(key);
		if (existing) {
			existing.sessions.push(session);
		} else {
			groups.set(key, {
				date: formatSessionDateRange(session),
				key,
				sessions: [session],
			});
		}
	}
	return [...groups.values()];
}

export function sessionListAfterDelete(
	sessions: SavedSessionSummary[],
	deletedId: string
): { next?: SavedSessionSummary; sessions: SavedSessionSummary[] } {
	const deletedIndex = sessions.findIndex((session) => session.id === deletedId);
	if (deletedIndex < 0) {
		return { next: sessions[0], sessions };
	}
	const remaining = sessions.filter((session) => session.id !== deletedId);
	return {
		next: remaining[Math.min(deletedIndex, remaining.length - 1)],
		sessions: remaining,
	};
}

export function adjacentSession(
	sessions: SavedSessionSummary[],
	selectedId: string | undefined,
	direction: 'next' | 'previous'
): SavedSessionSummary | undefined {
	const selectedIndex = sessions.findIndex((session) => session.id === selectedId);
	if (selectedIndex < 0) {
		return sessions[0];
	}
	return sessions[selectedIndex + (direction === 'next' ? 1 : -1)];
}

export function formatSessionTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		hour12: true,
		minute: '2-digit',
	})
		.format(timestamp)
		.replace(MERIDIEM_SUFFIX, (suffix) => suffix.trim().toLowerCase());
}

export function formatSessionTimeRange(session: SessionTiming): string {
	const started = formatSessionTime(session.startedAt);
	if (!hasRecordedSessionEnd(session)) {
		return started;
	}
	return `${started} – ${formatSessionTime(session.endedAt)}`;
}

export function formatSessionListTime(session: SessionTiming): string {
	return sessionSpansDates(session)
		? formatSessionTimeRange(session)
		: formatSessionTime(session.startedAt);
}

export function formatSessionImportTime(timestamp: number): string {
	return SESSION_IMPORT_FORMATTER.format(timestamp);
}

export function formatSessionImportLabel(session: Pick<SavedSessionSummary, 'importedAt'>): string {
	return session.importedAt === undefined
		? 'Imported'
		: `Imported ${formatSessionImportTime(session.importedAt)}`;
}

export async function requestPersistentSessionStorage(): Promise<boolean> {
	if (!navigator.storage?.persist) {
		return false;
	}
	if (await navigator.storage.persisted()) {
		return true;
	}
	return navigator.storage.persist();
}
