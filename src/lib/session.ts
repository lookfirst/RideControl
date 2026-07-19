import { emptyMetrics, emptySession } from '../constants';
import type {
	ControlMode,
	MetricAggregate,
	MetricSample,
	Metrics,
	SessionAggregates,
	SessionSnapshot,
	StoredSession,
} from '../types';

type ReadableStorage = Pick<Storage, 'getItem'>;

export function nonNegativeNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function sessionContinuation(snapshot: SessionSnapshot): StoredSession {
	return {
		aggregates: snapshot.aggregates,
		calories: snapshot.calories,
		controlMode: snapshot.controlMode,
		distance: snapshot.distance,
		elapsedSeconds: snapshot.elapsedSeconds,
		ended: false,
		endedAt: 0,
		history: snapshot.history,
		maximums: snapshot.maximums,
		startedAt: snapshot.startedAt,
	};
}

export function sessionNeedsUnloadWarning(ended: boolean, elapsedSeconds: number): boolean {
	return !ended && elapsedSeconds > 0;
}

export function requestUnloadConfirmation(
	event: Pick<BeforeUnloadEvent, 'preventDefault' | 'returnValue'>
): void {
	event.preventDefault();
	event.returnValue = true;
}

export function addAggregate(
	aggregate: MetricAggregate,
	value: number,
	includeZero: boolean
): MetricAggregate {
	if (!(value > 0 || includeZero)) {
		return aggregate;
	}
	return {
		count: aggregate.count + 1,
		sum: aggregate.sum + Math.max(0, value),
	};
}

export function addMetricAggregates(
	aggregates: SessionAggregates,
	metrics: Pick<Metrics, 'cadence' | 'heartRate' | 'power'> &
		Partial<Pick<MetricSample, 'gear' | 'resistance'>>
): SessionAggregates {
	return {
		cadence: addAggregate(aggregates.cadence, metrics.cadence, false),
		gear:
			typeof metrics.gear === 'number'
				? addAggregate(aggregates.gear, metrics.gear, true)
				: aggregates.gear,
		heartRate: addAggregate(aggregates.heartRate, metrics.heartRate, false),
		power: addAggregate(aggregates.power, metrics.power, true),
		resistance:
			typeof metrics.resistance === 'number'
				? addAggregate(aggregates.resistance, metrics.resistance, true)
				: aggregates.resistance,
	};
}

export function aggregateGear(samples: Partial<Pick<MetricSample, 'gear'>>[]): MetricAggregate {
	return samples.reduce<MetricAggregate>(
		(aggregate, sample) => {
			if (typeof sample.gear !== 'number' || !Number.isFinite(sample.gear)) {
				return aggregate;
			}
			return addAggregate(
				aggregate,
				Math.min(24, Math.max(1, Math.round(sample.gear))),
				true
			);
		},
		{ count: 0, sum: 0 }
	);
}

export function aggregateResistance(
	samples: Partial<Pick<MetricSample, 'resistance'>>[]
): MetricAggregate {
	return samples.reduce<MetricAggregate>(
		(aggregate, sample) => {
			if (typeof sample.resistance !== 'number' || !Number.isFinite(sample.resistance)) {
				return aggregate;
			}
			return addAggregate(aggregate, Math.min(100, Math.max(0, sample.resistance)), true);
		},
		{ count: 0, sum: 0 }
	);
}

export function restoreAggregate(
	saved: MetricAggregate | undefined,
	fallback: MetricAggregate
): MetricAggregate {
	if (!saved) {
		return fallback;
	}
	return {
		count: nonNegativeNumber(saved.count),
		sum: nonNegativeNumber(saved.sum),
	};
}

function optionalControlValue(value: unknown, minimum: number, maximum: number) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return;
	}
	return Math.min(maximum, Math.max(minimum, value));
}

export function controlModeForHistory(
	history: Partial<Pick<MetricSample, 'gear'>>[],
	savedMode?: ControlMode
): ControlMode {
	if (savedMode === 'gear' || savedMode === 'resistance') {
		return savedMode;
	}
	return history.some((sample) => typeof sample.gear === 'number') ? 'gear' : 'resistance';
}

export function loadStoredSession(storage: ReadableStorage = localStorage): StoredSession {
	const saved = storage.getItem('trainer-session');
	if (!saved) {
		return emptySession;
	}
	try {
		const parsed = JSON.parse(saved) as Partial<StoredSession>;
		const maximums = parsed.maximums ?? emptyMetrics;
		const history = Array.isArray(parsed.history)
			? parsed.history.slice(-3600).map((sample) => ({
					cadence: nonNegativeNumber(sample.cadence),
					elapsedSeconds: nonNegativeNumber(sample.elapsedSeconds),
					gear: optionalControlValue(sample.gear, 1, 24),
					heartRate: nonNegativeNumber(sample.heartRate),
					power: nonNegativeNumber(sample.power),
					resistance: optionalControlValue(sample.resistance, 0, 100),
					speed: nonNegativeNumber(sample.speed),
				}))
			: [];
		const historyAggregates = history.reduce(addMetricAggregates, emptySession.aggregates);
		return {
			aggregates: {
				cadence: restoreAggregate(parsed.aggregates?.cadence, historyAggregates.cadence),
				gear: restoreAggregate(parsed.aggregates?.gear, historyAggregates.gear),
				heartRate: restoreAggregate(
					parsed.aggregates?.heartRate,
					historyAggregates.heartRate
				),
				power: restoreAggregate(parsed.aggregates?.power, historyAggregates.power),
				resistance: restoreAggregate(
					parsed.aggregates?.resistance,
					historyAggregates.resistance
				),
			},
			calories: nonNegativeNumber(parsed.calories),
			controlMode: controlModeForHistory(history, parsed.controlMode),
			distance: nonNegativeNumber(parsed.distance),
			elapsedSeconds: nonNegativeNumber(parsed.elapsedSeconds),
			ended: parsed.ended === true,
			endedAt: nonNegativeNumber(parsed.endedAt),
			history,
			maximums: {
				cadence: nonNegativeNumber(maximums.cadence),
				calories: 0,
				distance: 0,
				heartRate: nonNegativeNumber(maximums.heartRate),
				power: nonNegativeNumber(maximums.power),
				speed: nonNegativeNumber(maximums.speed),
			},
			savedSessionId:
				typeof parsed.savedSessionId === 'string' ? parsed.savedSessionId : undefined,
			startedAt: nonNegativeNumber(parsed.startedAt),
		};
	} catch {
		return emptySession;
	}
}

export function storedResistance(storage: ReadableStorage = localStorage) {
	const saved = storage.getItem('trainer-resistance-percent');
	if (saved === null) {
		return 10;
	}
	const value = Number(saved);
	return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 10;
}
