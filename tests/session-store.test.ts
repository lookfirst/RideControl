import { describe, expect, test } from 'bun:test';
import { emptyMetrics, emptySession } from '../src/constants';
import { CONTROL_MODE } from '../src/lib/control-mode';
import { WORKOUT_COURSES } from '../src/lib/workouts';
import {
	createSessionStore,
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

	test('uses trainer distance deltas and records virtual gear with applied resistance', () => {
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
		expect(store.get().history[0]?.resistance).toBe(42);
		expect(store.get().aggregates.gear).toEqual({ count: 1, maximum: 16, sum: 16 });
		expect(store.get().aggregates.resistance).toEqual({ count: 1, maximum: 42, sum: 42 });
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

	test('records selected workout terrain atomically with ride samples', () => {
		const workout = WORKOUT_COURSES.find((course) => course.id === 'cedar-circuit');
		if (!workout) {
			throw new Error('Expected a built-in workout course');
		}
		const store = createSessionStore(restoredSession(), 1000);
		store.actions.selectWorkout(workout);
		expect(store.get().controlMode).toBe(CONTROL_MODE.RESISTANCE);
		store.actions.syncRiding(true);
		store.actions.selectWorkout(WORKOUT_COURSES[0]);
		expect(store.get().workout?.course.id).toBe(workout.id);
		store.actions.recordTick({
			control: { gear: 12, mode: 'resistance', resistance: 20 },
			distanceDelta: 0.4,
			metrics: liveMetrics,
			seconds: 1,
		});
		store.actions.recordTick({
			control: { gear: 12, mode: 'resistance', resistance: 30 },
			distanceDelta: 2,
			metrics: liveMetrics,
			seconds: 1,
		});
		store.actions.recordTick({
			control: { gear: 12, mode: 'resistance', resistance: 20 },
			distanceDelta: 0.8,
			metrics: liveMetrics,
			seconds: 1,
		});

		expect(store.get().workout?.course.id).toBe(workout.id);
		expect(store.get().history[0]).toMatchObject({
			workoutDistance: 0.4,
			workoutLap: 1,
		});
		expect(store.get().history[0]?.elevation).toBeGreaterThan(0);
		expect(store.get().history[0]?.grade).toBeCloseTo(0);
		expect(store.get().elevationTotals.ascent).toBeCloseTo(36);
		expect(store.get().elevationTotals.descent).toBeCloseTo(24);

		store.actions.selectWorkout(WORKOUT_COURSES[0]);
		expect(store.get().workout?.course.id).toBe(workout.id);
		const snapshotWorkout = sessionSnapshotFromState(store.get()).workout;
		const storedWorkout = storedSessionFromState(store.get()).workout;
		if (!(snapshotWorkout && storedWorkout)) {
			throw new Error('Expected workout metadata in session persistence');
		}
		expect(snapshotWorkout.course.id).toBe(workout.id);
		expect(storedWorkout.course.id).toBe(workout.id);
		expect(sessionSnapshotFromState(store.get()).elevationTotals).toEqual(
			store.get().elevationTotals
		);
		expect(storedSessionFromState(store.get()).elevationTotals).toEqual(
			store.get().elevationTotals
		);
	});

	test('records virtual gears and workout terrain in the same ride samples', () => {
		const workout = WORKOUT_COURSES.find((course) => course.id === 'cedar-circuit');
		if (!workout) {
			throw new Error('Expected a built-in workout course');
		}
		const store = createSessionStore(restoredSession({ controlMode: CONTROL_MODE.GEAR }), 1000);
		store.actions.selectWorkout(workout);
		expect(store.get().controlMode).toBe(CONTROL_MODE.GEAR);
		store.actions.syncRiding(true);
		store.actions.recordTick({
			control: { gear: 8, mode: CONTROL_MODE.GEAR, resistance: 20 },
			distanceDelta: 1,
			metrics: liveMetrics,
			seconds: 1,
		});

		expect(store.get().history[0]).toMatchObject({
			gear: 8,
			workoutDistance: 1,
			workoutLap: 1,
		});
		expect(store.get().history[0]?.elevation).toBeGreaterThan(0);
		expect(store.get().history[0]?.resistance).toBe(20);
		expect(store.get().aggregates.gear).toEqual({ count: 1, maximum: 8, sum: 8 });
		expect(store.get().aggregates.resistance).toEqual({ count: 1, maximum: 20, sum: 20 });
	});

	test('replaces an unstarted workout when its saved definition is revised', () => {
		const workout = WORKOUT_COURSES.find((course) => course.id === 'cedar-circuit');
		if (!workout) {
			throw new Error('Expected a built-in workout course');
		}
		const staleDefinition = {
			...workout,
			points: workout.points.map((point) => ({ ...point, x: point.x / 2 })),
		};
		const store = createSessionStore(restoredSession(), 1000);
		store.actions.selectWorkout(staleDefinition);
		expect(store.get().workout?.course).toBe(staleDefinition);

		store.actions.selectWorkout(workout);
		expect(store.get().workout?.course).toBe(workout);

		store.actions.selectWorkout(staleDefinition);
		store.actions.syncRiding(true);
		store.actions.recordTick({
			control: { gear: 12, mode: 'resistance', resistance: 20 },
			metrics: liveMetrics,
			seconds: 1,
		});
		store.actions.selectWorkout(workout);
		expect(store.get().workout?.course).toBe(workout);
		store.actions.selectWorkout(WORKOUT_COURSES[0]);
		expect(store.get().workout?.course).toBe(workout);
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
			elevationTotals: { ascent: 120, descent: 80 },
			endedAt: 4000,
			history: [],
			maximums: emptyMetrics,
			startedAt: 2000,
		});
		expect(store.get()).toMatchObject({
			calories: 100,
			distance: 12,
			elapsedSeconds: 900,
			elevationTotals: { ascent: 120, descent: 80 },
			ended: false,
			endedAt: 0,
			startedAt: 2000,
		});
		expect(store.get().savedSessionId).toBeUndefined();
	});

	test('plans a workout for the next session without changing the completed ride', () => {
		const [completedCourse, plannedCourse] = WORKOUT_COURSES;
		if (!(completedCourse && plannedCourse)) {
			throw new Error('Expected built-in workout courses');
		}
		const store = createSessionStore(
			restoredSession({
				elapsedSeconds: 60,
				ended: true,
				workout: { course: completedCourse },
			}),
			1000
		);

		store.actions.selectWorkout(plannedCourse);
		expect(store.get().workout?.course.id).toBe(completedCourse.id);
		expect(store.get().plannedWorkout?.course.id).toBe(plannedCourse.id);
		const snapshot = sessionSnapshotFromState(store.get());
		const stored = storedSessionFromState(store.get());
		if (!(snapshot.workout && stored.plannedWorkout)) {
			throw new Error('Expected current and planned workouts to be retained');
		}
		expect(snapshot.workout.course.id).toBe(completedCourse.id);
		expect(snapshot).not.toHaveProperty('plannedWorkout');
		expect(stored.plannedWorkout.course.id).toBe(plannedCourse.id);

		store.actions.reset(CONTROL_MODE.GEAR, 5000);
		expect(store.get().ended).toBe(false);
		expect(store.get().controlMode).toBe(CONTROL_MODE.GEAR);
		expect(store.get().workout?.course.id).toBe(plannedCourse.id);
		expect(store.get().plannedWorkout).toBeUndefined();
	});

	test('keeps an ended workout selected for the next session', () => {
		const [completedCourse] = WORKOUT_COURSES;
		if (!completedCourse) {
			throw new Error('Expected a built-in workout course');
		}
		const store = createSessionStore(restoredSession(), 1000);
		store.actions.selectWorkout(completedCourse);

		store.actions.endSession(5000);
		expect(store.get()).toMatchObject({
			ended: true,
			plannedWorkout: { course: completedCourse },
			workout: { course: completedCourse },
		});

		store.actions.reset(CONTROL_MODE.GEAR, 6000);
		expect(store.get()).toMatchObject({
			ended: false,
			plannedWorkout: undefined,
			workout: { course: completedCourse },
		});
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

	test('persists only durable state and preserves the complete history', () => {
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
		expect(saved.history).toHaveLength(3601);
		expect(saved.history[0]?.elapsedSeconds).toBe(0);
		expect(saved).not.toHaveProperty('isRiding');
		expect(saved).not.toHaveProperty('manuallyPaused');
		expect(sessionSnapshotFromState(store.get())).not.toHaveProperty('ended');
	});
});
