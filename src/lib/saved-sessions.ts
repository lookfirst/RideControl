import type {
	SavedSession,
	SavedSessionSummary,
	SessionFeeling,
	SessionMetadata,
	SessionSnapshot,
	SessionWorkout,
	StoredSession,
} from '../types';
import { IMPORTED_FIT_ID_PREFIX } from './activity-file';
import { restoreElevationTotals } from './elevation';
import { indexedDbRequestResult, indexedDbTransactionComplete } from './indexed-db';
import { riderPhysicsProfileFromStoredValue } from './profile';
import {
	aggregateGear,
	aggregateResistance,
	controlModeForHistory,
	restoreAggregate,
	restoreStoredSession,
} from './session';
import {
	createSessionWorkoutSnapshot,
	restoreSessionWorkoutSnapshot,
	restoreSnapshotWorkout,
	type SessionWorkoutSnapshot,
} from './session-workout-snapshots';
import { IMPORTED_TCX_ID_PREFIX } from './tcx-schema';
import { isFiniteNumber, isRecord, isString } from './type-guards';
import { restoreSessionWorkout } from './workouts';

const DATABASE_NAME = 'ridecontrol-sessions';
const DATABASE_VERSION = 3;
const ACTIVE_SESSION_ID = 'current';
const ACTIVE_SESSION_STORE = 'active-session';
const ACTIVE_SESSION_SAMPLE_STORE = 'active-session-samples';
const ACTIVE_SESSION_SAMPLE_CHUNK_SIZE = 100;
const SESSION_STORE = 'sessions';
const SUMMARY_STORE = 'session-summaries';
const WORKOUT_STORE = 'session-workouts';
const ENDED_AT_INDEX = 'endedAt';
const WORKOUT_SNAPSHOT_INDEX = 'workoutSnapshotId';
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

export type SavedSessionRecord = Omit<SavedSession, 'workout'> & {
	workout?: SessionWorkout;
	workoutSnapshotId?: string;
};

interface ActiveSessionRecord {
	generation: string;
	id: typeof ACTIVE_SESSION_ID;
	sampleCount: number;
	session: Omit<StoredSession, 'history'>;
}

interface ActiveSessionSampleChunk {
	generation: string;
	id: string;
	index: number;
	samples: StoredSession['history'];
}

let databasePromise: Promise<IDBDatabase> | undefined;

function storedSessionRecords(session: SavedSession): {
	session: SavedSessionRecord;
	snapshot?: SessionWorkoutSnapshot;
} {
	const snapshot = createSessionWorkoutSnapshot(session.workout);
	const { workout: _workout, ...record } = session;
	return {
		session: snapshot ? { ...record, workoutSnapshotId: snapshot.id } : record,
		snapshot,
	};
}

function migrateLegacySessionWorkouts(sessions: IDBObjectStore, workouts: IDBObjectStore): void {
	const request = sessions.openCursor();
	request.addEventListener('success', () => {
		const cursor = request.result;
		if (!cursor) {
			return;
		}
		const value: unknown = cursor.value;
		if (isRecord(value) && !isString(value.workoutSnapshotId)) {
			const workout = restoreSnapshotWorkout(value.workout);
			const snapshot = createSessionWorkoutSnapshot(workout);
			if (snapshot) {
				const { workout: _workout, ...record } = value;
				workouts.put(snapshot);
				cursor.update({ ...record, workoutSnapshotId: snapshot.id });
			}
		}
		cursor.continue();
	});
}

function sessionStoreForUpgrade(request: IDBOpenDBRequest): IDBObjectStore | undefined {
	const database = request.result;
	const sessions = database.objectStoreNames.contains(SESSION_STORE)
		? request.transaction?.objectStore(SESSION_STORE)
		: database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
	if (sessions && !sessions.indexNames.contains(WORKOUT_SNAPSHOT_INDEX)) {
		sessions.createIndex(WORKOUT_SNAPSHOT_INDEX, WORKOUT_SNAPSHOT_INDEX);
	}
	return sessions;
}

function workoutStoreForUpgrade(request: IDBOpenDBRequest): IDBObjectStore | undefined {
	return request.result.objectStoreNames.contains(WORKOUT_STORE)
		? request.transaction?.objectStore(WORKOUT_STORE)
		: request.result.createObjectStore(WORKOUT_STORE, { keyPath: 'id' });
}

function createMissingDatabaseStores(database: IDBDatabase): void {
	if (!database.objectStoreNames.contains(SUMMARY_STORE)) {
		const summaries = database.createObjectStore(SUMMARY_STORE, { keyPath: 'id' });
		summaries.createIndex(ENDED_AT_INDEX, ENDED_AT_INDEX);
	}
	if (!database.objectStoreNames.contains(ACTIVE_SESSION_STORE)) {
		database.createObjectStore(ACTIVE_SESSION_STORE, { keyPath: 'id' });
	}
	if (!database.objectStoreNames.contains(ACTIVE_SESSION_SAMPLE_STORE)) {
		database.createObjectStore(ACTIVE_SESSION_SAMPLE_STORE, { keyPath: 'id' });
	}
}

function upgradeDatabase(request: IDBOpenDBRequest, oldVersion: number): void {
	const sessions = sessionStoreForUpgrade(request);
	createMissingDatabaseStores(request.result);
	const workouts = workoutStoreForUpgrade(request);
	if (oldVersion < 2 && sessions && workouts) {
		migrateLegacySessionWorkouts(sessions, workouts);
	}
}

function openDatabase(): Promise<IDBDatabase> {
	if (databasePromise) {
		return databasePromise;
	}
	databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.addEventListener(
			'upgradeneeded',
			(event) => {
				upgradeDatabase(request, (event as IDBVersionChangeEvent).oldVersion);
			},
			{ once: true }
		);
		request.addEventListener('success', () => resolve(request.result), { once: true });
		request.addEventListener('error', () => reject(request.error), { once: true });
	});
	return databasePromise;
}

function activeSessionGeneration(session: StoredSession): string {
	return session.startedAt.toString();
}

function activeSessionRecord(session: StoredSession): ActiveSessionRecord {
	const { history: _history, ...sessionWithoutHistory } = session;
	return {
		generation: activeSessionGeneration(session),
		id: ACTIVE_SESSION_ID,
		sampleCount: session.history.length,
		session: sessionWithoutHistory,
	};
}

function activeSessionChunks(
	session: StoredSession,
	firstChunkIndex: number
): ActiveSessionSampleChunk[] {
	const generation = activeSessionGeneration(session);
	const chunkCount = Math.ceil(session.history.length / ACTIVE_SESSION_SAMPLE_CHUNK_SIZE);
	return Array.from({ length: Math.max(0, chunkCount - firstChunkIndex) }, (_, offset) => {
		const index = firstChunkIndex + offset;
		return {
			generation,
			id: `${generation}:${index.toString().padStart(10, '0')}`,
			index,
			samples: session.history.slice(
				index * ACTIVE_SESSION_SAMPLE_CHUNK_SIZE,
				(index + 1) * ACTIVE_SESSION_SAMPLE_CHUNK_SIZE
			),
		};
	});
}

function restoredActiveSession(
	recordValue: unknown,
	chunkValues: unknown[]
): StoredSession | undefined {
	if (!(isRecord(recordValue) && isString(recordValue.generation))) {
		return;
	}
	const chunks = chunkValues
		.filter(
			(value): value is ActiveSessionSampleChunk =>
				isRecord(value) &&
				value.generation === recordValue.generation &&
				isFiniteNumber(value.index) &&
				Array.isArray(value.samples)
		)
		.sort((left, right) => left.index - right.index);
	const history = chunks.flatMap((chunk) => chunk.samples);
	return restoreStoredSession({
		...(isRecord(recordValue.session) ? recordValue.session : {}),
		history: isFiniteNumber(recordValue.sampleCount)
			? history.slice(0, recordValue.sampleCount)
			: history,
	});
}

export async function loadActiveSession(): Promise<StoredSession | undefined> {
	const database = await openDatabase();
	const transaction = database.transaction(
		[ACTIVE_SESSION_STORE, ACTIVE_SESSION_SAMPLE_STORE],
		'readonly'
	);
	const completed = indexedDbTransactionComplete(transaction);
	const [record, chunks] = await Promise.all([
		indexedDbRequestResult(
			transaction.objectStore(ACTIVE_SESSION_STORE).get(ACTIVE_SESSION_ID)
		),
		indexedDbRequestResult(transaction.objectStore(ACTIVE_SESSION_SAMPLE_STORE).getAll()),
	]);
	await completed;
	return restoredActiveSession(record, chunks as unknown[]);
}

export async function persistActiveSession(session: StoredSession): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction(
		[ACTIVE_SESSION_STORE, ACTIVE_SESSION_SAMPLE_STORE],
		'readwrite'
	);
	const completed = indexedDbTransactionComplete(transaction);
	const sessions = transaction.objectStore(ACTIVE_SESSION_STORE);
	const samples = transaction.objectStore(ACTIVE_SESSION_SAMPLE_STORE);
	const previous = await indexedDbRequestResult(
		sessions.get(ACTIVE_SESSION_ID) as IDBRequest<ActiveSessionRecord | undefined>
	);
	const generation = activeSessionGeneration(session);
	const resetSamples =
		previous?.generation !== generation || previous.sampleCount > session.history.length;
	if (resetSamples) {
		samples.clear();
	}
	const firstChunkIndex = resetSamples
		? 0
		: Math.floor((previous?.sampleCount ?? 0) / ACTIVE_SESSION_SAMPLE_CHUNK_SIZE);
	if (resetSamples || (previous?.sampleCount ?? 0) < session.history.length) {
		for (const chunk of activeSessionChunks(session, firstChunkIndex)) {
			samples.put(chunk);
		}
	}
	sessions.put(activeSessionRecord(session));
	await completed;
}

export async function clearActiveSession(): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction(
		[ACTIVE_SESSION_STORE, ACTIVE_SESSION_SAMPLE_STORE],
		'readwrite'
	);
	const completed = indexedDbTransactionComplete(transaction);
	transaction.objectStore(ACTIVE_SESSION_STORE).delete(ACTIVE_SESSION_ID);
	transaction.objectStore(ACTIVE_SESSION_SAMPLE_STORE).clear();
	await completed;
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
		...(session.workout ? { workoutName: session.workout.course.name } : {}),
		startedAt: session.startedAt,
	};
}

function normalizedImportedAt(importedAt: unknown): number | undefined {
	return isFiniteNumber(importedAt) && importedAt >= 0 ? importedAt : undefined;
}

async function getSessionWorkoutSnapshot(
	database: IDBDatabase,
	id: string
): Promise<SessionWorkoutSnapshot | undefined> {
	const transaction = database.transaction(WORKOUT_STORE, 'readonly');
	const completed = indexedDbTransactionComplete(transaction);
	const value: unknown = await indexedDbRequestResult(
		transaction.objectStore(WORKOUT_STORE).get(id)
	);
	await completed;
	return restoreSessionWorkoutSnapshot(value);
}

export function normalizeSavedSessionRecord(
	record: SavedSessionRecord,
	snapshot?: SessionWorkoutSnapshot
): SavedSession {
	const { workoutSnapshotId: _workoutSnapshotId, ...session } = record;
	return normalizeSavedSession({
		...session,
		workout: snapshot ? snapshot.workout : restoreSessionWorkout(record.workout),
	});
}

export function normalizeSavedSessionSummary(session: SavedSessionSummary): SavedSessionSummary {
	return {
		...session,
		importedAt: normalizedImportedAt(session.importedAt),
		workoutName: isString(session.workoutName) ? session.workoutName : undefined,
	};
}

export function isImportedSession(
	session: Pick<SavedSessionSummary, 'id' | 'importedAt'>
): boolean {
	return (
		session.importedAt !== undefined ||
		session.id.startsWith(IMPORTED_FIT_ID_PREFIX) ||
		session.id.startsWith(IMPORTED_TCX_ID_PREFIX)
	);
}

type StoreGetter<T> = (name: string) => T;

export function saveSessionRecords(
	getStore: StoreGetter<Pick<IDBObjectStore, 'put'>>,
	session: SavedSession
): { snapshotId?: string } {
	const records = storedSessionRecords(session);
	getStore(SESSION_STORE).put(records.session);
	getStore(SUMMARY_STORE).put(sessionSummary(session));
	if (records.snapshot) {
		getStore(WORKOUT_STORE).put(records.snapshot);
	}
	return { snapshotId: records.snapshot?.id };
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
	const transaction = database.transaction(
		[SESSION_STORE, SUMMARY_STORE, WORKOUT_STORE],
		'readwrite'
	);
	const completed = indexedDbTransactionComplete(transaction);
	const sessions = transaction.objectStore(SESSION_STORE);
	const previous = await indexedDbRequestResult(
		sessions.get(session.id) as IDBRequest<SavedSessionRecord | undefined>
	);
	const { snapshotId } = saveSessionRecords((name) => transaction.objectStore(name), session);
	if (previous?.workoutSnapshotId && previous.workoutSnapshotId !== snapshotId) {
		const remaining = await indexedDbRequestResult(
			sessions.index(WORKOUT_SNAPSHOT_INDEX).count(previous.workoutSnapshotId)
		);
		if (remaining === 0) {
			transaction.objectStore(WORKOUT_STORE).delete(previous.workoutSnapshotId);
		}
	}
	await completed;
}

export async function deleteSavedSession(id: string): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction(
		[SESSION_STORE, SUMMARY_STORE, WORKOUT_STORE],
		'readwrite'
	);
	const completed = indexedDbTransactionComplete(transaction);
	const sessions = transaction.objectStore(SESSION_STORE);
	const record = await indexedDbRequestResult(
		sessions.get(id) as IDBRequest<SavedSessionRecord | undefined>
	);
	deleteSessionRecords((name) => transaction.objectStore(name), id);
	if (record?.workoutSnapshotId) {
		const remaining = await indexedDbRequestResult(
			sessions.index(WORKOUT_SNAPSHOT_INDEX).count(record.workoutSnapshotId)
		);
		if (remaining === 0) {
			transaction.objectStore(WORKOUT_STORE).delete(record.workoutSnapshotId);
		}
	}
	await completed;
}

export async function getSavedSession(id: string): Promise<SavedSession | undefined> {
	const database = await openDatabase();
	const transaction = database.transaction(SESSION_STORE, 'readonly');
	const completed = indexedDbTransactionComplete(transaction);
	const record = await indexedDbRequestResult(
		transaction.objectStore(SESSION_STORE).get(id) as IDBRequest<SavedSessionRecord | undefined>
	);
	await completed;
	if (!record) {
		return;
	}
	const snapshot = record.workoutSnapshotId
		? await getSessionWorkoutSnapshot(database, record.workoutSnapshotId)
		: undefined;
	return normalizeSavedSessionRecord(record, snapshot);
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
		elevationTotals: restoreElevationTotals(session.elevationTotals, session.history),
		importedAt: normalizedImportedAt(session.importedAt),
		profileSnapshot: riderPhysicsProfileFromStoredValue(session.profileSnapshot),
		workout: restoreSessionWorkout(session.workout),
	};
}

export async function countSavedSessions(): Promise<number> {
	const database = await openDatabase();
	const transaction = database.transaction(SUMMARY_STORE, 'readonly');
	const completed = indexedDbTransactionComplete(transaction);
	const count = await indexedDbRequestResult(transaction.objectStore(SUMMARY_STORE).count());
	await completed;
	return count;
}

export async function listSavedSessions(
	limit = 30,
	beforeEndedAt?: number
): Promise<SavedSessionSummary[]> {
	const database = await openDatabase();
	const transaction = database.transaction(SUMMARY_STORE, 'readonly');
	const completed = indexedDbTransactionComplete(transaction);
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
	const completed = indexedDbTransactionComplete(transaction);
	const records = await indexedDbRequestResult(
		transaction.objectStore(SESSION_STORE).getAll() as IDBRequest<SavedSessionRecord[]>
	);
	await completed;
	const workoutTransaction = database.transaction(WORKOUT_STORE, 'readonly');
	const workoutsCompleted = indexedDbTransactionComplete(workoutTransaction);
	const snapshotValues: unknown[] = await indexedDbRequestResult(
		workoutTransaction.objectStore(WORKOUT_STORE).getAll()
	);
	await workoutsCompleted;
	const snapshots = new Map(
		snapshotValues.flatMap((value) => {
			const snapshot = restoreSessionWorkoutSnapshot(value);
			return snapshot ? [[snapshot.id, snapshot] as const] : [];
		})
	);
	return records
		.map((record) =>
			normalizeSavedSessionRecord(
				record,
				record.workoutSnapshotId ? snapshots.get(record.workoutSnapshotId) : undefined
			)
		)
		.sort((left, right) => right.endedAt - left.endedAt);
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
