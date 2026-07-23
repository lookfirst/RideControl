import { createStore } from '@tanstack/react-store';
import { emptyMetrics, emptySession } from '../constants';
import { CONTROL_MODE, type ControlMode } from '../lib/control-mode';
import { estimatedCyclingCalories } from '../lib/cycling-energy';
import {
	type RiderPhysicsProfile,
	sameRiderPhysicsProfile,
	snapshotRiderPhysicsProfile,
} from '../lib/profile';
import { addMetricAggregates, sessionContinuation } from '../lib/session';
import { kilometersTraveled } from '../lib/units';
import {
	workoutElevationTotalsAtDistance,
	workoutSelectionLocked,
	workoutTerrainAtDistance,
} from '../lib/workouts';
import type {
	Metrics,
	SessionSnapshot,
	SessionWorkout,
	StoredSession,
	WorkoutCourse,
} from '../types';

interface RecordSessionTick {
	control: {
		gear: number;
		mode: ControlMode;
		resistance: number;
	};
	distanceDelta?: number;
	metrics: Metrics;
	profileSnapshot?: RiderPhysicsProfile;
	seconds: number;
}

export interface SessionStoreState extends StoredSession {
	isRiding: boolean;
	manuallyPaused: boolean;
}

function initialSessionState(restored: StoredSession, now: number): SessionStoreState {
	return {
		...restored,
		isRiding: false,
		manuallyPaused: false,
		startedAt: restored.startedAt || now,
	};
}

function sameWorkout(workout: SessionWorkout | undefined, course: WorkoutCourse | undefined) {
	return workout?.course === course;
}

function selectPlannedWorkout(
	current: SessionStoreState,
	course: WorkoutCourse | undefined
): SessionStoreState {
	return sameWorkout(current.plannedWorkout, course)
		? current
		: { ...current, plannedWorkout: course ? { course } : undefined };
}

function selectActiveWorkout(
	current: SessionStoreState,
	course: WorkoutCourse | undefined
): SessionStoreState {
	if (sameWorkout(current.workout, course)) {
		return current;
	}
	return {
		...current,
		workout: course ? { course } : undefined,
	};
}

function selectWorkoutForState(
	current: SessionStoreState,
	course: WorkoutCourse | undefined
): SessionStoreState {
	if (current.ended) {
		return selectPlannedWorkout(current, course);
	}
	if (!workoutSelectionLocked(current)) {
		return selectActiveWorkout(current, course);
	}
	const currentWorkoutId = current.workout ? current.workout.course.id : undefined;
	const nextWorkoutId = course ? course.id : undefined;
	return currentWorkoutId === nextWorkoutId ? selectActiveWorkout(current, course) : current;
}

function elevationTotalsAfterTick(current: SessionStoreState, distance: number) {
	return current.workout
		? workoutElevationTotalsAtDistance(current.workout.course, distance)
		: current.elevationTotals;
}

function profileSnapshotAfterTick(
	current: RiderPhysicsProfile | undefined,
	observed: RiderPhysicsProfile | undefined
): RiderPhysicsProfile | undefined {
	if (current) {
		return current;
	}
	return observed ? snapshotRiderPhysicsProfile(observed) : undefined;
}

export function sessionSnapshotFromState(state: SessionStoreState): SessionSnapshot {
	return {
		aggregates: state.aggregates,
		calories: state.calories,
		controlMode: state.controlMode,
		distance: state.distance,
		elapsedSeconds: state.elapsedSeconds,
		elevationTotals: state.elevationTotals,
		endedAt: state.endedAt,
		history: state.history,
		maximums: state.maximums,
		profileSnapshot: state.profileSnapshot,
		startedAt: state.startedAt,
		workout: state.workout,
	};
}

export function storedSessionFromState(state: SessionStoreState): StoredSession {
	return {
		aggregates: state.aggregates,
		calories: state.calories,
		controlMode: state.controlMode,
		discarded: state.discarded,
		distance: state.distance,
		elapsedSeconds: state.elapsedSeconds,
		elevationTotals: state.elevationTotals,
		ended: state.ended,
		endedAt: state.endedAt,
		history: state.history,
		maximums: state.maximums,
		plannedWorkout: state.plannedWorkout,
		profileSnapshot: state.profileSnapshot,
		savedSessionId: state.savedSessionId,
		startedAt: state.startedAt,
		workout: state.workout,
	};
}

export function createSessionStore(restored: StoredSession, now = Date.now()) {
	return createStore(initialSessionState(restored, now), ({ setState }) => ({
		continueFrom: (sourceSession: SessionSnapshot) => {
			const continued = sessionContinuation(sourceSession);
			setState(() => ({
				...continued,
				isRiding: false,
				manuallyPaused: false,
			}));
		},
		endSession: (endedAt: number) => {
			setState((current) => ({
				...current,
				ended: true,
				endedAt,
				isRiding: false,
				manuallyPaused: false,
				plannedWorkout: current.workout,
			}));
		},
		markDiscarded: () => {
			setState((current) => ({ ...current, discarded: true, savedSessionId: undefined }));
		},
		markSaved: (savedSessionId: string) => {
			setState((current) => ({ ...current, discarded: false, savedSessionId }));
		},
		observeControlMode: (controlMode: ControlMode) => {
			setState((current) =>
				current.elapsedSeconds === 0 && current.controlMode !== controlMode
					? { ...current, controlMode }
					: current
			);
		},
		observeMetrics: (metrics: Metrics) => {
			setState((current) => {
				if (current.ended) {
					return current;
				}
				const maximums = {
					...current.maximums,
					cadence: Math.max(current.maximums.cadence, metrics.cadence),
					heartRate: Math.max(current.maximums.heartRate, metrics.heartRate),
					power: Math.max(current.maximums.power, metrics.power),
					speed: Math.max(current.maximums.speed, metrics.speed),
				};
				if (
					maximums.cadence === current.maximums.cadence &&
					maximums.heartRate === current.maximums.heartRate &&
					maximums.power === current.maximums.power &&
					maximums.speed === current.maximums.speed
				) {
					return current;
				}
				return { ...current, maximums };
			});
		},
		observeProfileSnapshot: (profile: RiderPhysicsProfile) => {
			setState((current) =>
				current.elapsedSeconds === 0 &&
				!current.ended &&
				!sameRiderPhysicsProfile(current.profileSnapshot, profile)
					? { ...current, profileSnapshot: snapshotRiderPhysicsProfile(profile) }
					: current
			);
		},
		recordTick: ({
			control,
			distanceDelta,
			metrics,
			profileSnapshot,
			seconds,
		}: RecordSessionTick) => {
			setState((current) => {
				if (!current.isRiding) {
					return current;
				}
				const elapsedSeconds = current.elapsedSeconds + seconds;
				const controlSample = {
					...(control.mode === CONTROL_MODE.GEAR ? { gear: control.gear } : {}),
					resistance: control.resistance,
				};
				const distance =
					current.distance +
					(distanceDelta ?? kilometersTraveled(metrics.speed, seconds));
				const terrain = current.workout
					? workoutTerrainAtDistance(current.workout.course, distance)
					: undefined;
				const workoutSample = terrain
					? {
							elevation: terrain.elevation,
							grade: terrain.grade,
							workoutDistance: terrain.distance,
							workoutLap: terrain.lap,
						}
					: {};
				const sample = {
					cadence: metrics.cadence,
					elapsedSeconds,
					heartRate: metrics.heartRate,
					power: metrics.power,
					speed: metrics.speed,
					...controlSample,
					...workoutSample,
				};
				const elevationTotals = elevationTotalsAfterTick(current, distance);
				return {
					...current,
					aggregates: addMetricAggregates(current.aggregates, {
						...metrics,
						...controlSample,
					}),
					calories: current.calories + estimatedCyclingCalories(metrics.power, seconds),
					controlMode: control.mode,
					distance,
					elapsedSeconds,
					elevationTotals,
					history: [...current.history, sample],
					profileSnapshot: profileSnapshotAfterTick(
						current.profileSnapshot,
						profileSnapshot
					),
				};
			});
		},
		reset: (controlMode: ControlMode, startedAt: number) => {
			setState((current) => {
				const workout = current.plannedWorkout;
				return {
					...emptySession,
					aggregates: emptySession.aggregates,
					controlMode,
					isRiding: false,
					manuallyPaused: false,
					maximums: emptyMetrics,
					plannedWorkout: undefined,
					startedAt,
					workout,
				};
			});
		},
		selectWorkout: (course?: WorkoutCourse) => {
			setState((current) => selectWorkoutForState(current, course));
		},
		syncRiding: (recentlyPedaling: boolean) => {
			setState((current) => {
				const isRiding = !(current.ended || current.manuallyPaused) && recentlyPedaling;
				return current.isRiding === isRiding ? current : { ...current, isRiding };
			});
		},
		togglePause: (recentlyPedaling: boolean) => {
			setState((current) => {
				if (current.ended) {
					return current;
				}
				const manuallyPaused = !current.manuallyPaused;
				return {
					...current,
					isRiding: manuallyPaused ? false : recentlyPedaling,
					manuallyPaused,
				};
			});
		},
	}));
}

export type SessionStore = ReturnType<typeof createSessionStore>;
