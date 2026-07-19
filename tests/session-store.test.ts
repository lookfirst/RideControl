import { describe, expect, test } from 'bun:test';
import { emptyMetrics, emptySession } from '../src/constants';
import {
	createSessionStore,
	persistSessionState,
	sessionSnapshotFromState,
	storedSessionFromState,
} from '../src/stores/session-store';
import type { Metrics, StoredSession } from '../src/types';

function restoredSession(overrides: Partial<StoredSession> = {}): StoredSession {
	return {
		...emptySession,
		aggregates: {
			cadence: { ...emptySession.aggregates.cadence },
			gear: { ...emptySession.aggregates.gear },
			heartRate: { ...emptySession.aggregates.heartRate },
			power: { ...emptySession.aggregates.power },
			resistance: { ...emptySession.aggregates.resistance },
		},
		maximums: { ...emptyMetrics },
		...overrides,
	};
}

const liveMetrics: Metrics = {
	cadence: 82,
	calories: 0,
	distance: 0,
	heartRate: 145,
	power: 200,
	speed: 36,
};

describe('session store', () => {
	test('records a complete ride tick as one atomic update', () => {
		const store = createSessionStore(restoredSession(), 1000);
		store.actions.syncRiding(true);
		let updates = 0;
		const subscription = store.subscribe(() => {
			updates += 1;
		});

		store.actions.recordTick({
			control: { gear: 12, mode: 'resistance', resistance: 42 },
			metrics: liveMetrics,
			seconds: 2,
		});

		const state = store.get();
		expect(updates).toBe(1);
		expect(state.elapsedSeconds).toBe(2);
		expect(state.distance).toBeCloseTo(0.02);
		expect(state.calories).toBeCloseTo(400 / (4184 * 0.24));
		expect(state.history).toEqual([
			{
				cadence: 82,
				elapsedSeconds: 2,
				heartRate: 145,
				power: 200,
				resistance: 42,
				speed: 36,
			},
		]);
		expect(state.aggregates.power).toEqual({ count: 1, maximum: 200, sum: 200 });
		expect(state.aggregates.resistance).toEqual({ count: 1, maximum: 42, sum: 42 });
		subscription.unsubscribe();
	});

	test('uses trainer distance deltas and records virtual gears independently', () => {
		const store = createSessionStore(restoredSession(), 1000);
		store.actions.syncRiding(true);
		store.actions.recordTick({
			control: { gear: 16, mode: 'gear', resistance: 42 },
			distanceDelta: 0.01,
			metrics: liveMetrics,
			seconds: 1,
		});

		expect(store.get().distance).toBe(0.01);
		expect(store.get().controlMode).toBe('gear');
		expect(store.get().history[0]?.gear).toBe(16);
		expect(store.get().history[0]?.resistance).toBeUndefined();
		expect(store.get().aggregates.gear).toEqual({ count: 1, maximum: 16, sum: 16 });
		expect(store.get().aggregates.resistance).toEqual({ count: 0, sum: 0 });
	});

	test('retains resistance and gear maxima after lower control samples', () => {
		const resistanceStore = createSessionStore(restoredSession(), 1000);
		resistanceStore.actions.syncRiding(true);
		for (const resistance of [70, 35]) {
			resistanceStore.actions.recordTick({
				control: { gear: 12, mode: 'resistance', resistance },
				metrics: liveMetrics,
				seconds: 1,
			});
		}
		expect(resistanceStore.get().aggregates.resistance.maximum).toBe(70);

		const gearStore = createSessionStore(restoredSession(), 1000);
		gearStore.actions.syncRiding(true);
		for (const gear of [20, 12]) {
			gearStore.actions.recordTick({
				control: { gear, mode: 'gear', resistance: 42 },
				metrics: liveMetrics,
				seconds: 1,
			});
		}
		expect(gearStore.get().aggregates.gear.maximum).toBe(20);
	});

	test('coordinates pause, end, reset, and continuation transitions', () => {
		const store = createSessionStore(restoredSession(), 1000);
		store.actions.syncRiding(true);
		expect(store.get().isRiding).toBeTrue();

		store.actions.togglePause(true);
		expect(store.get()).toMatchObject({ isRiding: false, manuallyPaused: true });
		store.actions.togglePause(true);
		expect(store.get()).toMatchObject({ isRiding: true, manuallyPaused: false });

		store.actions.endSession(5000);
		expect(store.get()).toMatchObject({
			ended: true,
			endedAt: 5000,
			isRiding: false,
			manuallyPaused: false,
		});
		store.actions.reset('gear', 6000);
		expect(store.get()).toMatchObject({
			controlMode: 'gear',
			elapsedSeconds: 0,
			ended: false,
			startedAt: 6000,
		});

		store.actions.continueFrom({
			aggregates: emptySession.aggregates,
			calories: 100,
			controlMode: 'resistance',
			distance: 12,
			elapsedSeconds: 900,
			endedAt: 4000,
			history: [],
			maximums: emptyMetrics,
			startedAt: 2000,
		});
		expect(store.get()).toMatchObject({
			calories: 100,
			distance: 12,
			elapsedSeconds: 900,
			ended: false,
			endedAt: 0,
			startedAt: 2000,
		});
		expect(store.get().savedSessionId).toBeUndefined();
	});

	test('records an intentional discard until the session is reset or saved', () => {
		const store = createSessionStore(restoredSession(), 1000);
		store.actions.endSession(5000);
		store.actions.markDiscarded();
		expect(store.get()).toMatchObject({ discarded: true, savedSessionId: undefined });
		expect(storedSessionFromState(store.get()).discarded).toBe(true);

		store.actions.markSaved('saved-session');
		expect(store.get()).toMatchObject({ discarded: false, savedSessionId: 'saved-session' });

		store.actions.markDiscarded();
		store.actions.reset('resistance', 6000);
		expect(store.get().discarded).toBe(false);
		expect(store.get().savedSessionId).toBeUndefined();
	});

	test('updates maxima without publishing unchanged snapshots or ended rides', () => {
		const store = createSessionStore(restoredSession(), 1000);
		let updates = 0;
		const subscription = store.subscribe(() => {
			updates += 1;
		});

		store.actions.observeMetrics(liveMetrics);
		expect(updates).toBe(1);
		expect(store.get().maximums).toMatchObject({
			cadence: 82,
			heartRate: 145,
			power: 200,
			speed: 36,
		});
		store.actions.observeMetrics(liveMetrics);
		expect(updates).toBe(1);
		store.actions.endSession(5000);
		store.actions.observeMetrics({ ...liveMetrics, power: 300 });
		expect(store.get().maximums.power).toBe(200);
		subscription.unsubscribe();
	});

	test('persists only durable state and caps stored history', () => {
		const history = Array.from({ length: 3601 }, (_, index) => ({
			cadence: 80,
			elapsedSeconds: index,
			heartRate: 140,
			power: 180,
			resistance: 40,
			speed: 30,
		}));
		const store = createSessionStore(restoredSession({ history }), 1000);
		store.actions.syncRiding(true);
		const saved = storedSessionFromState(store.get());
		expect(saved.history).toHaveLength(3600);
		expect(saved.history[0]?.elapsedSeconds).toBe(1);
		expect(saved).not.toHaveProperty('isRiding');
		expect(saved).not.toHaveProperty('manuallyPaused');
		expect(sessionSnapshotFromState(store.get())).not.toHaveProperty('ended');

		let storedKey = '';
		let storedValue = '';
		persistSessionState(store.get(), {
			setItem: (key, value) => {
				storedKey = key;
				storedValue = value;
			},
		});
		expect(storedKey).toBe('trainer-session');
		expect(JSON.parse(storedValue).history).toHaveLength(3600);
	});
});
