import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyMetrics, emptySession, RECORDING_PAUSE_DELAY_MS } from '../constants';
import { addMetricAggregates, loadStoredSession, sessionContinuation } from '../lib/session';
import type {
	ControlMode,
	MetricSample,
	Metrics,
	SessionAggregates,
	SessionSnapshot,
	StoredSession,
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
	elapsedSeconds: number;
	ended: boolean;
	endSession: () => void;
	history: MetricSample[];
	isRiding: boolean;
	manuallyPaused: boolean;
	markSaved: (id: string) => void;
	maximums: Metrics;
	rideCalories: number;
	rideDistance: number;
	savedSessionId?: string;
	snapshot: SessionSnapshot;
	startedAt: number;
	startNew: () => void;
	togglePause: () => void;
}

export function useSession(
	metrics: Metrics,
	control: SessionControlState,
	lastPedalingAt: ActivityRef,
	trainerReportsDistance: FlagRef
): SessionController {
	const restored = useMemo(loadStoredSession, []);
	const initialStartedAt = useMemo(() => restored.startedAt || Date.now(), [restored.startedAt]);
	const [isRiding, setIsRiding] = useState(false);
	const [manuallyPaused, setManuallyPaused] = useState(false);
	const [ended, setEnded] = useState<boolean>(restored.ended);
	const [endedAt, setEndedAt] = useState(restored.endedAt);
	const [elapsedSeconds, setElapsedSeconds] = useState(restored.elapsedSeconds);
	const [rideDistance, setRideDistance] = useState(restored.distance);
	const [rideCalories, setRideCalories] = useState(restored.calories);
	const [controlMode, setControlMode] = useState<ControlMode>(restored.controlMode);
	const [history, setHistory] = useState<MetricSample[]>(restored.history);
	const [maximums, setMaximums] = useState<Metrics>(restored.maximums);
	const [aggregates, setAggregates] = useState<SessionAggregates>(restored.aggregates);
	const [savedSessionId, setSavedSessionId] = useState<string | undefined>(
		restored.savedSessionId
	);
	const [startedAt, setStartedAt] = useState(initialStartedAt);
	const latestMetrics = useRef(metrics);
	const latestControl = useRef(control);
	const elapsedRef = useRef(restored.elapsedSeconds);
	const lastTrainerDistance = useRef<number | undefined>(undefined);

	useEffect(() => {
		latestMetrics.current = metrics;
		if (ended) {
			return;
		}
		setMaximums((current) => ({
			...current,
			cadence: Math.max(current.cadence, metrics.cadence),
			heartRate: Math.max(current.heartRate, metrics.heartRate),
			power: Math.max(current.power, metrics.power),
			speed: Math.max(current.speed, metrics.speed),
		}));
	}, [ended, metrics]);

	useEffect(() => {
		latestControl.current = control;
		if (elapsedRef.current === 0) {
			setControlMode(control.mode);
		}
	}, [control]);

	useEffect(() => {
		localStorage.setItem(
			'trainer-session',
			JSON.stringify({
				aggregates,
				calories: rideCalories,
				controlMode,
				distance: rideDistance,
				elapsedSeconds,
				ended,
				endedAt,
				history: history.slice(-3600),
				maximums,
				savedSessionId,
				startedAt,
			} satisfies StoredSession)
		);
	}, [
		aggregates,
		controlMode,
		elapsedSeconds,
		ended,
		endedAt,
		history,
		maximums,
		rideCalories,
		rideDistance,
		savedSessionId,
		startedAt,
	]);

	useEffect(() => {
		const interval = window.setInterval(() => {
			const recentlyPedaling =
				lastPedalingAt.current > 0 &&
				performance.now() - lastPedalingAt.current <= RECORDING_PAUSE_DELAY_MS;
			setIsRiding(!(ended || manuallyPaused) && recentlyPedaling);
		}, 500);
		return () => window.clearInterval(interval);
	}, [ended, lastPedalingAt, manuallyPaused]);

	useEffect(() => {
		if (!isRiding) {
			return;
		}
		let lastTick = performance.now();
		if (trainerReportsDistance.current) {
			lastTrainerDistance.current = latestMetrics.current.distance;
		}
		const interval = window.setInterval(() => {
			const now = performance.now();
			const seconds = (now - lastTick) / 1000;
			lastTick = now;
			const live = latestMetrics.current;
			const liveControl = latestControl.current;
			const controlSample =
				liveControl.mode === 'gear'
					? { gear: liveControl.gear }
					: { resistance: liveControl.resistance };
			elapsedRef.current += seconds;
			setElapsedSeconds(elapsedRef.current);
			setControlMode(liveControl.mode);
			if (trainerReportsDistance.current) {
				const previous = lastTrainerDistance.current;
				const delta = previous === undefined ? 0 : live.distance - previous;
				if (delta >= 0 && delta < 0.25) {
					setRideDistance((value) => value + delta);
				}
				lastTrainerDistance.current = live.distance;
			} else {
				setRideDistance((value) => value + (live.speed * seconds) / 3600);
			}
			setHistory((samples) => [
				...samples,
				{
					cadence: live.cadence,
					elapsedSeconds: elapsedRef.current,
					heartRate: live.heartRate,
					power: live.power,
					speed: live.speed,
					...controlSample,
				},
			]);
			setAggregates((current) => addMetricAggregates(current, { ...live, ...controlSample }));
			if (live.power > 0) {
				setRideCalories((value) => value + (live.power * seconds) / (4184 * 0.24));
			}
		}, 1000);
		return () => window.clearInterval(interval);
	}, [isRiding, trainerReportsDistance]);

	const togglePause = useCallback(() => {
		if (ended) {
			return;
		}
		if (manuallyPaused) {
			setManuallyPaused(false);
			setIsRiding(
				lastPedalingAt.current > 0 &&
					performance.now() - lastPedalingAt.current <= RECORDING_PAUSE_DELAY_MS
			);
		} else {
			setManuallyPaused(true);
			setIsRiding(false);
		}
	}, [ended, lastPedalingAt, manuallyPaused]);

	const endSession = useCallback(() => {
		setEnded(true);
		setEndedAt(Date.now());
		setIsRiding(false);
		setManuallyPaused(false);
	}, []);

	const markSaved = useCallback((id: string) => {
		setSavedSessionId(id);
	}, []);

	const startNew = useCallback(() => {
		elapsedRef.current = 0;
		lastTrainerDistance.current = latestMetrics.current.distance;
		lastPedalingAt.current = 0;
		setEnded(false);
		setEndedAt(0);
		setElapsedSeconds(0);
		setRideDistance(0);
		setRideCalories(0);
		setControlMode(latestControl.current.mode);
		setHistory([]);
		setIsRiding(false);
		setManuallyPaused(false);
		setMaximums(emptyMetrics);
		setAggregates(emptySession.aggregates);
		setSavedSessionId(undefined);
		setStartedAt(Date.now());
		localStorage.removeItem('trainer-session');
	}, [lastPedalingAt]);

	const continueFrom = useCallback(
		(sourceSession: SessionSnapshot) => {
			const continued = sessionContinuation(sourceSession);
			elapsedRef.current = continued.elapsedSeconds;
			lastTrainerDistance.current = latestMetrics.current.distance;
			lastPedalingAt.current = 0;
			setEnded(false);
			setEndedAt(0);
			setElapsedSeconds(continued.elapsedSeconds);
			setRideDistance(continued.distance);
			setRideCalories(continued.calories);
			setControlMode(continued.controlMode);
			setHistory(continued.history);
			setIsRiding(false);
			setManuallyPaused(false);
			setMaximums(continued.maximums);
			setAggregates(continued.aggregates);
			setSavedSessionId(undefined);
			setStartedAt(continued.startedAt);
			localStorage.removeItem('trainer-session');
		},
		[lastPedalingAt]
	);

	const snapshot = useMemo<SessionSnapshot>(
		() => ({
			aggregates,
			calories: rideCalories,
			controlMode,
			distance: rideDistance,
			elapsedSeconds,
			endedAt,
			history,
			maximums,
			startedAt,
		}),
		[
			aggregates,
			controlMode,
			elapsedSeconds,
			endedAt,
			history,
			maximums,
			rideCalories,
			rideDistance,
			startedAt,
		]
	);

	return {
		aggregates,
		continueFrom,
		controlMode,
		elapsedSeconds,
		ended,
		endSession,
		history,
		isRiding,
		manuallyPaused,
		markSaved,
		maximums,
		rideCalories,
		rideDistance,
		savedSessionId,
		snapshot,
		startedAt,
		startNew,
		togglePause,
	};
}
