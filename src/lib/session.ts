import { emptyMetrics, emptySession } from '../constants';
import type { MetricAggregate, Metrics, SessionAggregates, StoredSession } from '../types';

type ReadableStorage = Pick<Storage, 'getItem'>;

export function nonNegativeNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
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
	metrics: Pick<Metrics, 'cadence' | 'heartRate' | 'power'>
): SessionAggregates {
	return {
		cadence: addAggregate(aggregates.cadence, metrics.cadence, false),
		heartRate: addAggregate(aggregates.heartRate, metrics.heartRate, false),
		power: addAggregate(aggregates.power, metrics.power, true),
	};
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
					heartRate: nonNegativeNumber(sample.heartRate),
					power: nonNegativeNumber(sample.power),
					speed: nonNegativeNumber(sample.speed),
				}))
			: [];
		const historyAggregates = history.reduce(addMetricAggregates, emptySession.aggregates);
		return {
			aggregates: {
				cadence: restoreAggregate(parsed.aggregates?.cadence, historyAggregates.cadence),
				heartRate: restoreAggregate(
					parsed.aggregates?.heartRate,
					historyAggregates.heartRate
				),
				power: restoreAggregate(parsed.aggregates?.power, historyAggregates.power),
			},
			calories: nonNegativeNumber(parsed.calories),
			distance: nonNegativeNumber(parsed.distance),
			elapsedSeconds: nonNegativeNumber(parsed.elapsedSeconds),
			ended: parsed.ended === true,
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
