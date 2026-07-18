import type { SavedSession, SavedSessionSummary, SessionMetadata, SessionSnapshot } from '../types';

const DATABASE_NAME = 'ridecontrol-sessions';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'sessions';
const SUMMARY_STORE = 'session-summaries';
const ENDED_AT_INDEX = 'endedAt';

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
	endedAt = Date.now(),
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

export function sessionSummary(session: SavedSession): SavedSessionSummary {
	return {
		calories: session.calories,
		distance: session.distance,
		elapsedSeconds: session.elapsedSeconds,
		endedAt: session.endedAt,
		feeling: session.feeling,
		id: session.id,
		startedAt: session.startedAt,
	};
}

export async function saveSession(session: SavedSession): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction([SESSION_STORE, SUMMARY_STORE], 'readwrite');
	const completed = transactionComplete(transaction);
	transaction.objectStore(SESSION_STORE).put(session);
	transaction.objectStore(SUMMARY_STORE).put(sessionSummary(session));
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
	return session;
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
			summaries.push(cursor.value as SavedSessionSummary);
			cursor.continue();
		});
	});
	await completed;
	return summaries;
}

export interface SessionGroup {
	date: string;
	key: string;
	sessions: SavedSessionSummary[];
}

export function groupSessionsByDate(sessions: SavedSessionSummary[]): SessionGroup[] {
	const groups = new Map<string, SessionGroup>();
	const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
	for (const session of sessions) {
		const date = new Date(session.startedAt);
		const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
		const existing = groups.get(key);
		if (existing) {
			existing.sessions.push(session);
		} else {
			groups.set(key, {
				date: dateFormatter.format(date),
				key,
				sessions: [session],
			});
		}
	}
	return [...groups.values()];
}

export function formatSessionTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	}).format(timestamp);
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
