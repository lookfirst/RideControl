import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { RECORDING_PAUSE_DELAY_MS } from '../constants';
import { loadStoredSession, SESSION_STORAGE_KEY } from '../lib/session';
import { MILLISECONDS_PER_SECOND, secondsForMilliseconds } from '../lib/units';
import {
	createSessionStore,
	persistSessionState,
	sessionSnapshotFromState,
} from '../stores/session-store';
import type {
	ControlMode,
	ElevationTotals,
	MetricSample,
	Metrics,
	SessionAggregates,
	SessionSnapshot,
	SessionWorkout,
	WorkoutCourse,
} from '../types';

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
	trainerReportsDistance: FlagRef
): SessionController {
	const store = useMemo(() => createSessionStore(loadStoredSession()), []);
	const state = useSelector(store);
	const latestMetrics = useRef(metrics);
	const latestControl = useRef(control);
	const lastTrainerDistance = useRef<number | undefined>(undefined);

	useEffect(() => {
		latestMetrics.current = metrics;
		store.actions.observeMetrics(metrics);
	}, [metrics, store]);

	useEffect(() => {
		latestControl.current = control;
		store.actions.observeControlMode(control.mode);
	}, [control, store]);

	useEffect(() => {
		persistSessionState(store.get());
		const subscription = store.subscribe((next) => persistSessionState(next));
		return () => subscription.unsubscribe();
	}, [store]);

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
		localStorage.removeItem(SESSION_STORAGE_KEY);
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
			localStorage.removeItem(SESSION_STORAGE_KEY);
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
		rideCalories: state.calories,
		rideDistance: state.distance,
		savedSessionId: state.savedSessionId,
		selectedWorkout: state.ended ? state.plannedWorkout : state.workout,
		selectWorkout,
		snapshot,
		startedAt: state.startedAt,
		startNew,
		togglePause,
		workout: state.workout,
	};
}
