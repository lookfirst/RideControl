import { z } from 'zod';
import type { MetricAggregate, SavedSession } from '../types';
import { nonNegativeNumber } from './numbers';
import { averageSpeed } from './units';

export const SESSION_ANALYTICS_CACHE_ID = 'all-sessions';
export const SESSION_ANALYTICS_SCHEMA_VERSION = 1;

export const SESSION_ANALYTICS_PERIOD = {
	MONTH: 'month',
	WEEK: 'week',
	YEAR: 'year',
} as const;

export type SessionAnalyticsPeriod =
	(typeof SESSION_ANALYTICS_PERIOD)[keyof typeof SESSION_ANALYTICS_PERIOD];

export const SESSION_TREND_METRIC = {
	AVERAGE_CADENCE: 'averageCadence',
	AVERAGE_GEAR: 'averageGear',
	AVERAGE_HEART_RATE: 'averageHeartRate',
	AVERAGE_POWER: 'averagePower',
	AVERAGE_RESISTANCE: 'averageResistance',
	AVERAGE_SPEED: 'averageSpeed',
	CALORIES: 'calories',
	CLIMBING: 'climbing',
	DISTANCE: 'distance',
	DOWNHILL: 'downhill',
	RIDE_TIME: 'rideTime',
	RIDES: 'rides',
} as const;

export type SessionTrendMetric = (typeof SESSION_TREND_METRIC)[keyof typeof SESSION_TREND_METRIC];

export const SESSION_ANALYTICS_PEAK = {
	CADENCE: 'cadence',
	CALORIES: 'calories',
	CLIMB: 'climb',
	DESCENT: 'descent',
	DISTANCE: 'distance',
	DURATION: 'duration',
	HEART_RATE: 'heartRate',
	POWER: 'power',
	SPEED: 'speed',
} as const;

export type SessionAnalyticsPeakKey =
	(typeof SESSION_ANALYTICS_PEAK)[keyof typeof SESSION_ANALYTICS_PEAK];

export interface SessionAnalyticsMetricTotal {
	count: number;
	sum: number;
}

export interface SessionAnalyticsRollup {
	ascent: number;
	cadence: SessionAnalyticsMetricTotal;
	calories: number;
	descent: number;
	distance: number;
	elapsedSeconds: number;
	gear: SessionAnalyticsMetricTotal;
	heartRate: SessionAnalyticsMetricTotal;
	power: SessionAnalyticsMetricTotal;
	resistance: SessionAnalyticsMetricTotal;
	sessionCount: number;
}

export interface SessionAnalyticsPeak {
	sessionId: string;
	value: number;
}

export type SessionAnalyticsPeaks = Record<
	SessionAnalyticsPeakKey,
	SessionAnalyticsPeak | undefined
>;

export interface SessionAnalyticsContribution {
	dayKey: string;
	id: string;
	monthKey: string;
	peaks: Record<SessionAnalyticsPeakKey, number>;
	rollup: SessionAnalyticsRollup;
	weekKey: string;
	yearKey: string;
}

export interface SessionAnalyticsCache {
	id: typeof SESSION_ANALYTICS_CACHE_ID;
	peaks: SessionAnalyticsPeaks;
	periods: {
		days: Record<string, SessionAnalyticsRollup>;
		months: Record<string, SessionAnalyticsRollup>;
		weeks: Record<string, SessionAnalyticsRollup>;
		years: Record<string, SessionAnalyticsRollup>;
	};
	schemaVersion: typeof SESSION_ANALYTICS_SCHEMA_VERSION;
	totals: SessionAnalyticsRollup;
	updatedAt: number;
}

const metricTotalSchema = z.object({
	count: z.number().finite().nonnegative(),
	sum: z.number().finite().nonnegative(),
});

const rollupSchema = z.object({
	ascent: z.number().finite().nonnegative(),
	cadence: metricTotalSchema,
	calories: z.number().finite().nonnegative(),
	descent: z.number().finite().nonnegative(),
	distance: z.number().finite().nonnegative(),
	elapsedSeconds: z.number().finite().nonnegative(),
	gear: metricTotalSchema,
	heartRate: metricTotalSchema,
	power: metricTotalSchema,
	resistance: metricTotalSchema,
	sessionCount: z.number().finite().nonnegative(),
});

const peakSchema = z
	.object({
		sessionId: z.string().min(1),
		value: z.number().finite().nonnegative(),
	})
	.optional();

const peaksSchema = z.object({
	cadence: peakSchema,
	calories: peakSchema,
	climb: peakSchema,
	descent: peakSchema,
	distance: peakSchema,
	duration: peakSchema,
	heartRate: peakSchema,
	power: peakSchema,
	speed: peakSchema,
});

const contributionSchema = z.object({
	dayKey: z.string().min(1),
	id: z.string().min(1),
	monthKey: z.string().min(1),
	peaks: z.object({
		cadence: z.number().finite().nonnegative(),
		calories: z.number().finite().nonnegative(),
		climb: z.number().finite().nonnegative(),
		descent: z.number().finite().nonnegative(),
		distance: z.number().finite().nonnegative(),
		duration: z.number().finite().nonnegative(),
		heartRate: z.number().finite().nonnegative(),
		power: z.number().finite().nonnegative(),
		speed: z.number().finite().nonnegative(),
	}),
	rollup: rollupSchema,
	weekKey: z.string().min(1),
	yearKey: z.string().min(1),
});

const cacheSchema = z.object({
	id: z.literal(SESSION_ANALYTICS_CACHE_ID),
	peaks: peaksSchema,
	periods: z.object({
		days: z.record(z.string(), rollupSchema),
		months: z.record(z.string(), rollupSchema),
		weeks: z.record(z.string(), rollupSchema),
		years: z.record(z.string(), rollupSchema),
	}),
	schemaVersion: z.literal(SESSION_ANALYTICS_SCHEMA_VERSION),
	totals: rollupSchema,
	updatedAt: z.number().finite().nonnegative(),
});

const PEAK_KEYS = Object.values(SESSION_ANALYTICS_PEAK);
const YEAR_KEY_PATTERN = /^\d{4}$/;

function emptyMetricTotal(): SessionAnalyticsMetricTotal {
	return { count: 0, sum: 0 };
}

export function emptySessionAnalyticsRollup(): SessionAnalyticsRollup {
	return {
		ascent: 0,
		cadence: emptyMetricTotal(),
		calories: 0,
		descent: 0,
		distance: 0,
		elapsedSeconds: 0,
		gear: emptyMetricTotal(),
		heartRate: emptyMetricTotal(),
		power: emptyMetricTotal(),
		resistance: emptyMetricTotal(),
		sessionCount: 0,
	};
}

function emptySessionAnalyticsPeaks(): SessionAnalyticsPeaks {
	return {
		cadence: undefined,
		calories: undefined,
		climb: undefined,
		descent: undefined,
		distance: undefined,
		duration: undefined,
		heartRate: undefined,
		power: undefined,
		speed: undefined,
	};
}

export function emptySessionAnalyticsCache(updatedAt = Date.now()): SessionAnalyticsCache {
	return {
		id: SESSION_ANALYTICS_CACHE_ID,
		peaks: emptySessionAnalyticsPeaks(),
		periods: {
			days: {},
			months: {},
			weeks: {},
			years: {},
		},
		schemaVersion: SESSION_ANALYTICS_SCHEMA_VERSION,
		totals: emptySessionAnalyticsRollup(),
		updatedAt,
	};
}

function metricTotal(aggregate: MetricAggregate): SessionAnalyticsMetricTotal {
	return {
		count: Math.max(0, Math.round(nonNegativeNumber(aggregate.count))),
		sum: nonNegativeNumber(aggregate.sum),
	};
}

function metricMaximum(aggregate: MetricAggregate): number {
	return nonNegativeNumber(aggregate.maximum);
}

function paddedDatePart(value: number): string {
	return value.toString().padStart(2, '0');
}

export function localSessionDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${paddedDatePart(date.getMonth() + 1)}-${paddedDatePart(date.getDate())}`;
}

function localSessionWeekKey(timestamp: number): string {
	const date = new Date(timestamp);
	date.setHours(0, 0, 0, 0);
	const daysSinceMonday = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - daysSinceMonday);
	return localSessionDateKey(date.getTime());
}

export function sessionAnalyticsContribution(
	session: Pick<
		SavedSession,
		| 'aggregates'
		| 'calories'
		| 'distance'
		| 'elapsedSeconds'
		| 'elevationTotals'
		| 'id'
		| 'maximums'
		| 'startedAt'
	>
): SessionAnalyticsContribution {
	const date = new Date(session.startedAt);
	const ascent = nonNegativeNumber(session.elevationTotals.ascent);
	const cadence = metricTotal(session.aggregates.cadence);
	const calories = nonNegativeNumber(session.calories);
	const descent = nonNegativeNumber(session.elevationTotals.descent);
	const gear = metricTotal(session.aggregates.gear);
	const heartRate = metricTotal(session.aggregates.heartRate);
	const power = metricTotal(session.aggregates.power);
	const resistance = metricTotal(session.aggregates.resistance);
	const distance = nonNegativeNumber(session.distance);
	const elapsedSeconds = nonNegativeNumber(session.elapsedSeconds);
	return {
		dayKey: localSessionDateKey(session.startedAt),
		id: session.id,
		monthKey: `${date.getFullYear()}-${paddedDatePart(date.getMonth() + 1)}`,
		peaks: {
			cadence: metricMaximum(session.aggregates.cadence),
			calories,
			climb: ascent,
			descent,
			distance,
			duration: elapsedSeconds,
			heartRate: metricMaximum(session.aggregates.heartRate),
			power: metricMaximum(session.aggregates.power),
			speed: nonNegativeNumber(session.maximums.speed),
		},
		rollup: {
			ascent,
			cadence,
			calories,
			descent,
			distance,
			elapsedSeconds,
			gear,
			heartRate,
			power,
			resistance,
			sessionCount: 1,
		},
		weekKey: localSessionWeekKey(session.startedAt),
		yearKey: date.getFullYear().toString(),
	};
}

function cloneMetricTotal(total: SessionAnalyticsMetricTotal): SessionAnalyticsMetricTotal {
	return { ...total };
}

function cloneRollup(rollup: SessionAnalyticsRollup): SessionAnalyticsRollup {
	return {
		...rollup,
		cadence: cloneMetricTotal(rollup.cadence),
		gear: cloneMetricTotal(rollup.gear),
		heartRate: cloneMetricTotal(rollup.heartRate),
		power: cloneMetricTotal(rollup.power),
		resistance: cloneMetricTotal(rollup.resistance),
	};
}

function clonePeriodRollups(
	rollups: Record<string, SessionAnalyticsRollup>
): Record<string, SessionAnalyticsRollup> {
	return Object.fromEntries(
		Object.entries(rollups).map(([key, rollup]) => [key, cloneRollup(rollup)])
	);
}

function cloneCache(cache: SessionAnalyticsCache): SessionAnalyticsCache {
	return {
		...cache,
		peaks: Object.fromEntries(
			PEAK_KEYS.map((key) => [key, cache.peaks[key] ? { ...cache.peaks[key] } : undefined])
		) as SessionAnalyticsPeaks,
		periods: {
			days: clonePeriodRollups(cache.periods.days),
			months: clonePeriodRollups(cache.periods.months),
			weeks: clonePeriodRollups(cache.periods.weeks),
			years: clonePeriodRollups(cache.periods.years),
		},
		totals: cloneRollup(cache.totals),
	};
}

function adjustedValue(current: number, change: number): number {
	const adjusted = current + change;
	return adjusted > 0 ? adjusted : 0;
}

function adjustMetricTotal(
	current: SessionAnalyticsMetricTotal,
	contribution: SessionAnalyticsMetricTotal,
	direction: 1 | -1
): void {
	current.count = adjustedValue(current.count, direction * contribution.count);
	current.sum = adjustedValue(current.sum, direction * contribution.sum);
}

function adjustRollup(
	current: SessionAnalyticsRollup,
	contribution: SessionAnalyticsRollup,
	direction: 1 | -1
): void {
	current.ascent = adjustedValue(current.ascent, direction * contribution.ascent);
	current.calories = adjustedValue(current.calories, direction * contribution.calories);
	current.descent = adjustedValue(current.descent, direction * contribution.descent);
	current.distance = adjustedValue(current.distance, direction * contribution.distance);
	current.elapsedSeconds = adjustedValue(
		current.elapsedSeconds,
		direction * contribution.elapsedSeconds
	);
	current.sessionCount = adjustedValue(
		current.sessionCount,
		direction * contribution.sessionCount
	);
	adjustMetricTotal(current.cadence, contribution.cadence, direction);
	adjustMetricTotal(current.gear, contribution.gear, direction);
	adjustMetricTotal(current.heartRate, contribution.heartRate, direction);
	adjustMetricTotal(current.power, contribution.power, direction);
	adjustMetricTotal(current.resistance, contribution.resistance, direction);
}

function periodBuckets(
	cache: SessionAnalyticsCache,
	contribution: SessionAnalyticsContribution
): [Record<string, SessionAnalyticsRollup>, string][] {
	return [
		[cache.periods.days, contribution.dayKey],
		[cache.periods.weeks, contribution.weekKey],
		[cache.periods.months, contribution.monthKey],
		[cache.periods.years, contribution.yearKey],
	];
}

function adjustContribution(
	cache: SessionAnalyticsCache,
	contribution: SessionAnalyticsContribution,
	direction: 1 | -1
): void {
	adjustRollup(cache.totals, contribution.rollup, direction);
	for (const [bucket, key] of periodBuckets(cache, contribution)) {
		const rollup = bucket[key] ?? emptySessionAnalyticsRollup();
		adjustRollup(rollup, contribution.rollup, direction);
		if (rollup.sessionCount === 0) {
			delete bucket[key];
		} else {
			bucket[key] = rollup;
		}
	}
}

function addContributionPeaks(
	peaks: SessionAnalyticsPeaks,
	contribution: SessionAnalyticsContribution
): void {
	for (const key of PEAK_KEYS) {
		const current = peaks[key];
		const value = contribution.peaks[key];
		if (!current || value > current.value) {
			peaks[key] = { sessionId: contribution.id, value };
		}
	}
}

export function updateSessionAnalyticsCache(
	current: SessionAnalyticsCache | undefined,
	previous: SessionAnalyticsContribution | undefined,
	next: SessionAnalyticsContribution | undefined,
	updatedAt = Date.now()
): { cache: SessionAnalyticsCache; peaksNeedRebuild: boolean } {
	const cache = cloneCache(current ?? emptySessionAnalyticsCache(updatedAt));
	let peaksNeedRebuild = false;
	if (previous) {
		adjustContribution(cache, previous, -1);
		peaksNeedRebuild = PEAK_KEYS.some((key) => cache.peaks[key]?.sessionId === previous.id);
	}
	if (next) {
		adjustContribution(cache, next, 1);
		addContributionPeaks(cache.peaks, next);
	}
	cache.updatedAt = updatedAt;
	return { cache, peaksNeedRebuild };
}

export function rebuildSessionAnalyticsPeaks(
	cache: SessionAnalyticsCache,
	contributions: SessionAnalyticsContribution[]
): SessionAnalyticsCache {
	const updated = cloneCache(cache);
	updated.peaks = emptySessionAnalyticsPeaks();
	for (const contribution of contributions) {
		addContributionPeaks(updated.peaks, contribution);
	}
	return updated;
}

export function buildSessionAnalyticsCache(
	contributions: SessionAnalyticsContribution[],
	updatedAt = Date.now()
): SessionAnalyticsCache {
	let cache = emptySessionAnalyticsCache(updatedAt);
	for (const contribution of contributions) {
		({ cache } = updateSessionAnalyticsCache(cache, undefined, contribution, updatedAt));
	}
	return cache;
}

export function restoreSessionAnalyticsCache(value: unknown): SessionAnalyticsCache | undefined {
	const parsed = cacheSchema.safeParse(value);
	if (!parsed.success) {
		return;
	}
	return {
		...parsed.data,
		peaks: {
			cadence: parsed.data.peaks.cadence,
			calories: parsed.data.peaks.calories,
			climb: parsed.data.peaks.climb,
			descent: parsed.data.peaks.descent,
			distance: parsed.data.peaks.distance,
			duration: parsed.data.peaks.duration,
			heartRate: parsed.data.peaks.heartRate,
			power: parsed.data.peaks.power,
			speed: parsed.data.peaks.speed,
		},
	};
}

export function restoreSessionAnalyticsContribution(
	value: unknown
): SessionAnalyticsContribution | undefined {
	const parsed = contributionSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
}

export function sessionAnalyticsMetricAverage(total: SessionAnalyticsMetricTotal): number {
	return total.count > 0 ? total.sum / total.count : 0;
}

export function sessionAnalyticsAverageSpeed(rollup: SessionAnalyticsRollup): number {
	return averageSpeed(rollup.distance, rollup.elapsedSeconds);
}

export function sessionAnalyticsPeriodRollups(
	cache: SessionAnalyticsCache,
	period: SessionAnalyticsPeriod
): [string, SessionAnalyticsRollup][] {
	return Object.entries(sessionAnalyticsRollupsForPeriod(cache, period)).sort(([left], [right]) =>
		left.localeCompare(right)
	);
}

function sessionAnalyticsRollupsForPeriod(
	cache: SessionAnalyticsCache,
	period: SessionAnalyticsPeriod
): Record<string, SessionAnalyticsRollup> {
	switch (period) {
		case SESSION_ANALYTICS_PERIOD.WEEK:
			return cache.periods.weeks;
		case SESSION_ANALYTICS_PERIOD.MONTH:
			return cache.periods.months;
		case SESSION_ANALYTICS_PERIOD.YEAR:
			return cache.periods.years;
		default:
			throw new Error('Unsupported session analytics period.');
	}
}

function trendPeriodKey(
	period: SessionAnalyticsPeriod,
	endTimestamp: number,
	offset: number
): string {
	const date = new Date(endTimestamp);
	date.setHours(12, 0, 0, 0);
	switch (period) {
		case SESSION_ANALYTICS_PERIOD.WEEK:
			date.setDate(date.getDate() + offset * 7);
			return localSessionWeekKey(date.getTime());
		case SESSION_ANALYTICS_PERIOD.MONTH:
			date.setDate(1);
			date.setMonth(date.getMonth() + offset);
			return `${date.getFullYear()}-${paddedDatePart(date.getMonth() + 1)}`;
		case SESSION_ANALYTICS_PERIOD.YEAR:
			return (date.getFullYear() + offset).toString();
		default:
			throw new Error('Unsupported session analytics period.');
	}
}

export function sessionAnalyticsTrendRollups(
	cache: SessionAnalyticsCache,
	period: SessionAnalyticsPeriod,
	endTimestamp = Date.now()
): [string, SessionAnalyticsRollup][] {
	const periodCount = period === SESSION_ANALYTICS_PERIOD.YEAR ? 10 : 12;
	const rollups = sessionAnalyticsRollupsForPeriod(cache, period);
	return Array.from({ length: periodCount }, (_, index) => {
		const key = trendPeriodKey(period, endTimestamp, index - periodCount + 1);
		return [key, rollups[key] ?? emptySessionAnalyticsRollup()];
	});
}

export function sessionAnalyticsCompleteTrendRollups(
	cache: SessionAnalyticsCache
): [string, SessionAnalyticsRollup][] {
	const yearKeys = Object.keys(cache.periods.years)
		.filter((key) => YEAR_KEY_PATTERN.test(key))
		.sort();
	const firstYear = Number(yearKeys[0]);
	const lastYear = Number(yearKeys.at(-1));
	if (!(Number.isFinite(firstYear) && Number.isFinite(lastYear))) {
		return [];
	}
	return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
		const key = (firstYear + index).toString();
		return [key, cache.periods.years[key] ?? emptySessionAnalyticsRollup()];
	});
}

export function sessionAnalyticsPeriodLabel(key: string, period: SessionAnalyticsPeriod): string {
	if (period === SESSION_ANALYTICS_PERIOD.YEAR) {
		return key;
	}
	const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	if (period === SESSION_ANALYTICS_PERIOD.MONTH) {
		return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(date);
	}
	return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
}
