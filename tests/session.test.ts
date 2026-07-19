import { describe, expect, test } from 'bun:test';
import { emptySession } from '../src/constants';
import {
	addAggregate,
	addMetricAggregates,
	aggregateResistance,
	loadStoredSession,
	nonNegativeNumber,
	requestUnloadConfirmation,
	restoreAggregate,
	sessionContinuation,
	sessionNeedsUnloadWarning,
	storedResistance,
} from '../src/lib/session';

const storageWith = (value: string | null) => ({
	getItem: () => value,
});

describe('session utilities', () => {
	test('accepts only finite non-negative numbers', () => {
		expect(nonNegativeNumber(4.5)).toBe(4.5);
		expect(nonNegativeNumber(-1)).toBe(0);
		expect(nonNegativeNumber(Number.NaN)).toBe(0);
		expect(nonNegativeNumber('4')).toBe(0);
	});

	test('creates an active unsaved continuation with all recorded data', () => {
		const snapshot = {
			aggregates: emptySession.aggregates,
			calories: 120,
			controlMode: 'resistance' as const,
			distance: 14,
			elapsedSeconds: 1800,
			endedAt: 5000,
			history: [
				{
					cadence: 80,
					elapsedSeconds: 1800,
					heartRate: 140,
					power: 200,
					resistance: 40,
					speed: 30,
				},
			],
			maximums: emptySession.maximums,
			startedAt: 1000,
		};
		const continued = sessionContinuation(snapshot);
		expect(continued).toMatchObject({ ...snapshot, ended: false, endedAt: 0 });
		expect(continued.savedSessionId).toBeUndefined();
	});

	test('protects recorded active sessions from accidental page exit', () => {
		expect(sessionNeedsUnloadWarning(false, 1)).toBe(true);
		expect(sessionNeedsUnloadWarning(false, 0)).toBe(false);
		expect(sessionNeedsUnloadWarning(true, 1)).toBe(false);

		let prevented = false;
		const event = {
			preventDefault: () => {
				prevented = true;
			},
			returnValue: false,
		};
		requestUnloadConfirmation(event);
		expect(prevented).toBe(true);
		expect(event.returnValue).toBe(true);
	});

	test('adds aggregate samples according to zero policy', () => {
		const initial = { count: 2, sum: 10 };
		expect(addAggregate(initial, 5, false)).toEqual({ count: 3, sum: 15 });
		expect(addAggregate(initial, 0, false)).toBe(initial);
		expect(addAggregate(initial, 0, true)).toEqual({ count: 3, sum: 10 });
	});

	test('aggregates cadence, heart rate, power, and resistance', () => {
		expect(
			addMetricAggregates(emptySession.aggregates, {
				cadence: 0,
				heartRate: 145,
				power: 0,
				resistance: 42,
			})
		).toEqual({
			cadence: { count: 0, sum: 0 },
			gear: { count: 0, sum: 0 },
			heartRate: { count: 1, sum: 145 },
			power: { count: 1, sum: 0 },
			resistance: { count: 1, sum: 42 },
		});
	});

	test('tracks gear without adding a resistance aggregate', () => {
		expect(
			addMetricAggregates(emptySession.aggregates, {
				cadence: 80,
				gear: 14,
				heartRate: 140,
				power: 200,
			})
		).toMatchObject({
			gear: { count: 1, sum: 14 },
			resistance: { count: 0, sum: 0 },
		});
	});

	test('aggregates recorded resistance samples and ignores missing legacy data', () => {
		expect(
			aggregateResistance([
				{},
				{ resistance: 25 },
				{ resistance: 125 },
				{ resistance: -10 },
				{ resistance: Number.NaN },
			])
		).toEqual({
			count: 3,
			sum: 125,
		});
	});

	test('restores valid aggregate values and falls back when absent', () => {
		expect(restoreAggregate({ count: -2, sum: 20 }, { count: 1, sum: 2 })).toEqual({
			count: 0,
			sum: 20,
		});
		expect(restoreAggregate(undefined, { count: 1, sum: 2 })).toEqual({
			count: 1,
			sum: 2,
		});
	});

	test('loads and sanitizes a stored session', () => {
		const stored = JSON.stringify({
			calories: -10,
			distance: 12,
			elapsedSeconds: 65,
			ended: true,
			endedAt: 5000,
			history: [
				{
					cadence: 90,
					elapsedSeconds: 65,
					heartRate: 150,
					power: 200,
					resistance: 42,
					speed: Number.NaN,
				},
			],
			maximums: { cadence: 95, heartRate: 160, power: 250, speed: 35 },
			savedSessionId: 'saved-session',
			startedAt: 1000,
		});
		const session = loadStoredSession(storageWith(stored));
		expect(session.calories).toBe(0);
		expect(session.distance).toBe(12);
		expect(session.ended).toBe(true);
		expect(session.endedAt).toBe(5000);
		expect(session.history[0]?.speed).toBe(0);
		expect(session.history[0]?.resistance).toBe(42);
		expect(session.history[0]?.gear).toBeUndefined();
		expect(session.controlMode).toBe('resistance');
		expect(session.aggregates.power).toEqual({ count: 1, sum: 200 });
		expect(session.aggregates.resistance).toEqual({ count: 1, sum: 42 });
		expect(session.maximums.speed).toBe(35);
		expect(session.savedSessionId).toBe('saved-session');
		expect(session.startedAt).toBe(1000);
	});

	test('uses an empty session for absent or malformed storage', () => {
		expect(loadStoredSession(storageWith(null))).toBe(emptySession);
		expect(loadStoredSession(storageWith('not-json'))).toBe(emptySession);
	});

	test('loads and clamps stored resistance', () => {
		expect(storedResistance(storageWith(null))).toBe(10);
		expect(storedResistance(storageWith('72'))).toBe(72);
		expect(storedResistance(storageWith('120'))).toBe(100);
		expect(storedResistance(storageWith('invalid'))).toBe(10);
	});
});
