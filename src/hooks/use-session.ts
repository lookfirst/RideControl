import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { RECORDING_PAUSE_DELAY_MS } from '../constants';
import { createActiveSessionWriter } from '../lib/active-session';
import { CONTROL_MODE, trainingControlMode } from '../lib/control-mode';
import type { RiderPhysicsProfile } from '../lib/profile';
import { MILLISECONDS_PER_SECOND, secondsForMilliseconds } from '../lib/units';
import {
	createSessionStore,
	sessionSnapshotFromState,
	storedSessionFromState,
} from '../stores/session-store';
import type {
	ControlMode,
	ElevationTotals,
	MetricSample,
	Metrics,
	SessionAggregates,
	SessionSnapshot,
	SessionWorkout,
	StoredSession,
	WorkoutCourse,
} from '../types';

const ACTIVE_SESSION_CHECKPOINT_INTERVAL_MS = 1000;

interface ActivityRef {
	current: number;
}

interface FlagRef {
	current: boolean;
}

interface SessionControlState {
	gear: number;
	mode: ControlMode;
	resistance: number;
}

interface SessionController {
	aggregates: SessionAggregates;
	continueFrom: (sourceSession: SessionSnapshot) => void;
	controlMode: ControlMode;
	discarded: boolean;
	elapsedSeconds: number;
	elevationTotals: ElevationTotals;
	ended: boolean;
	endSession: () => void;
	history: MetricSample[];
	isRiding: boolean;
	manuallyPaused: boolean;
	markDiscarded: () => void;
	markSaved: (id: string) => void;
	maximums: Metrics;
	profileSnapshot?: RiderPhysicsProfile;
	rideCalories: number;
	rideDistance: number;
	savedSessionId?: string;
	selectedWorkout?: SessionWorkout;
	selectWorkout: (course?: WorkoutCourse) => void;
	snapshot: SessionSnapshot;
	startedAt: number;
	startNew: () => void;
	togglePause: () => void;
	workout?: SessionWorkout;
}

export function useSession(
	metrics: Metrics,
	control: SessionControlState,
	lastPedalingAt: ActivityRef,
	trainerReportsDistance: FlagRef,
	initialSession: StoredSession,
	profileSnapshot?: RiderPhysicsProfile
): SessionController {
	const store = useMemo(() => createSessionStore(initialSession), [initialSession]);
	const persistActive = useMemo(() => createActiveSessionWriter(), []);
	const state = useSelector(store);
	const selectedWorkout = state.ended ? state.plannedWorkout : state.workout;
	const activeControl = selectedWorkout
		? {
				...control,
				mode: trainingControlMode(control.mode === CONTROL_MODE.GEAR, true),
			}
		: control;
	const latestMetrics = useRef(metrics);
	const latestControl = useRef(activeControl);
	const latestProfileSnapshot = useRef(profileSnapshot);
	const lastTrainerDistance = useRef<number | undefined>(undefined);

	useEffect(() => {
		latestMetrics.current = metrics;
		store.actions.observeMetrics(metrics);
	}, [metrics, store]);

	useEffect(() => {
		latestControl.current = activeControl;
		store.actions.observeControlMode(activeControl.mode);
	}, [activeControl, store]);

	useEffect(() => {
		latestProfileSnapshot.current = profileSnapshot;
		if (profileSnapshot) {
			store.actions.observeProfileSnapshot(profileSnapshot);
		}
	}, [profileSnapshot, store]);

	useEffect(() => {
		const checkpoint = () => {
			persistActive(storedSessionFromState(store.get())).catch(() => undefined);
		};
		checkpoint();
		const interval = window.setInterval(checkpoint, ACTIVE_SESSION_CHECKPOINT_INTERVAL_MS);
		const persistWhenHidden = () => {
			if (document.visibilityState === 'hidden') {
				checkpoint();
			}
		};
		document.addEventListener('visibilitychange', persistWhenHidden);
		return () => {
			window.clearInterval(interval);
			document.removeEventListener('visibilitychange', persistWhenHidden);
			checkpoint();
		};
	}, [persistActive, store]);

	useEffect(() => {
		const interval = window.setInterval(() => {
			const recentlyPedaling =
				lastPedalingAt.current > 0 &&
				performance.now() - lastPedalingAt.current <= RECORDING_PAUSE_DELAY_MS;
			store.actions.syncRiding(recentlyPedaling);
		}, 500);
		return () => window.clearInterval(interval);
	}, [lastPedalingAt, store]);

	useEffect(() => {
		if (!state.isRiding) {
			return;
		}
		let lastTick = performance.now();
		if (trainerReportsDistance.current) {
			lastTrainerDistance.current = latestMetrics.current.distance;
		}
		const interval = window.setInterval(() => {
			const now = performance.now();
			const seconds = secondsForMilliseconds(now - lastTick);
			lastTick = now;
			const live = latestMetrics.current;
			const liveControl = latestControl.current;
			let distanceDelta: number | undefined;
			if (trainerReportsDistance.current) {
				const previous = lastTrainerDistance.current;
				const delta = previous === undefined ? 0 : live.distance - previous;
				distanceDelta = delta >= 0 && delta < 0.25 ? delta : 0;
				lastTrainerDistance.current = live.distance;
			}
			store.actions.recordTick({
				control: liveControl,
				distanceDelta,
				metrics: live,
				profileSnapshot: latestProfileSnapshot.current,
				seconds,
			});
		}, MILLISECONDS_PER_SECOND);
		return () => window.clearInterval(interval);
	}, [state.isRiding, store, trainerReportsDistance]);

	const togglePause = useCallback(() => {
		const recentlyPedaling =
			lastPedalingAt.current > 0 &&
			performance.now() - lastPedalingAt.current <= RECORDING_PAUSE_DELAY_MS;
		store.actions.togglePause(recentlyPedaling);
	}, [lastPedalingAt, store]);

	const endSession = useCallback(() => {
		store.actions.endSession(Date.now());
	}, [store]);

	const markSaved = useCallback(
		(id: string) => {
			store.actions.markSaved(id);
		},
		[store]
	);
	const markDiscarded = useCallback(() => {
		store.actions.markDiscarded();
	}, [store]);

	const startNew = useCallback(() => {
		lastTrainerDistance.current = latestMetrics.current.distance;
		lastPedalingAt.current = 0;
		store.actions.reset(latestControl.current.mode, Date.now());
	}, [lastPedalingAt, store]);

	const selectWorkout = useCallback(
		(course?: WorkoutCourse) => store.actions.selectWorkout(course),
		[store]
	);

	const continueFrom = useCallback(
		(sourceSession: SessionSnapshot) => {
			lastTrainerDistance.current = latestMetrics.current.distance;
			lastPedalingAt.current = 0;
			store.actions.continueFrom(sourceSession);
		},
		[lastPedalingAt, store]
	);

	const snapshot = useMemo(() => sessionSnapshotFromState(state), [state]);

	return {
		aggregates: state.aggregates,
		continueFrom,
		controlMode: state.controlMode,
		discarded: state.discarded,
		elapsedSeconds: state.elapsedSeconds,
		elevationTotals: state.elevationTotals,
		ended: state.ended,
		endSession,
		history: state.history,
		isRiding: state.isRiding,
		manuallyPaused: state.manuallyPaused,
		markDiscarded,
		markSaved,
		maximums: state.maximums,
		profileSnapshot: state.profileSnapshot,
		rideCalories: state.calories,
		rideDistance: state.distance,
		savedSessionId: state.savedSessionId,
		selectedWorkout,
		selectWorkout,
		snapshot,
		startedAt: state.startedAt,
		startNew,
		togglePause,
		workout: state.workout,
	};
}
