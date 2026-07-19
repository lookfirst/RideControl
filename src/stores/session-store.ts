import { createStore } from '@tanstack/react-store';
import { emptyMetrics, emptySession } from '../constants';
import { addMetricAggregates, sessionContinuation } from '../lib/session';
import type { ControlMode, Metrics, SessionSnapshot, StoredSession } from '../types';

interface RecordSessionTick {
	control: {
		gear: number;
		mode: ControlMode;
		resistance: number;
	};
	distanceDelta?: number;
	metrics: Metrics;
	seconds: number;
}

export interface SessionStoreState extends StoredSession {
	isRiding: boolean;
	manuallyPaused: boolean;
}

type SessionStorage = Pick<Storage, 'setItem'>;

function initialSessionState(restored: StoredSession, now: number): SessionStoreState {
	return {
		...restored,
		isRiding: false,
		manuallyPaused: false,
		startedAt: restored.startedAt || now,
	};
}

export function sessionSnapshotFromState(state: SessionStoreState): SessionSnapshot {
	return {
		aggregates: state.aggregates,
		calories: state.calories,
		controlMode: state.controlMode,
		distance: state.distance,
		elapsedSeconds: state.elapsedSeconds,
		endedAt: state.endedAt,
		history: state.history,
		maximums: state.maximums,
		startedAt: state.startedAt,
	};
}

export function storedSessionFromState(state: SessionStoreState): StoredSession {
	return {
		aggregates: state.aggregates,
		calories: state.calories,
		controlMode: state.controlMode,
		distance: state.distance,
		elapsedSeconds: state.elapsedSeconds,
		ended: state.ended,
		endedAt: state.endedAt,
		history: state.history.slice(-3600),
		maximums: state.maximums,
		savedSessionId: state.savedSessionId,
		startedAt: state.startedAt,
	};
}

export function persistSessionState(
	state: SessionStoreState,
	storage: SessionStorage = localStorage
) {
	storage.setItem('trainer-session', JSON.stringify(storedSessionFromState(state)));
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
			}));
		},
		markSaved: (savedSessionId: string) => {
			setState((current) => ({ ...current, savedSessionId }));
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
		recordTick: ({ control, distanceDelta, metrics, seconds }: RecordSessionTick) => {
			setState((current) => {
				if (!current.isRiding) {
					return current;
				}
				const elapsedSeconds = current.elapsedSeconds + seconds;
				const controlSample =
					control.mode === 'gear'
						? { gear: control.gear }
						: { resistance: control.resistance };
				const sample = {
					cadence: metrics.cadence,
					elapsedSeconds,
					heartRate: metrics.heartRate,
					power: metrics.power,
					speed: metrics.speed,
					...controlSample,
				};
				return {
					...current,
					aggregates: addMetricAggregates(current.aggregates, {
						...metrics,
						...controlSample,
					}),
					calories:
						current.calories +
						(metrics.power > 0 ? (metrics.power * seconds) / (4184 * 0.24) : 0),
					controlMode: control.mode,
					distance:
						current.distance + (distanceDelta ?? (metrics.speed * seconds) / 3600),
					elapsedSeconds,
					history: [...current.history, sample],
				};
			});
		},
		reset: (controlMode: ControlMode, startedAt: number) => {
			setState(() => ({
				...emptySession,
				aggregates: emptySession.aggregates,
				controlMode,
				isRiding: false,
				manuallyPaused: false,
				maximums: emptyMetrics,
				startedAt,
			}));
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
