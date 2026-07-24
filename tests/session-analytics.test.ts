import { describe, expect, test } from 'bun:test';
import { sessionSummary } from '../src/lib/saved-sessions';
import {
	buildSessionAnalyticsCache,
	emptySessionAnalyticsCache,
	rebuildSessionAnalyticsPeaks,
	restoreSessionAnalyticsCache,
	SESSION_ANALYTICS_PEAK,
	SESSION_ANALYTICS_PERIOD,
	sessionAnalyticsAverageSpeed,
	sessionAnalyticsCompleteTrendRollups,
	sessionAnalyticsContribution,
	sessionAnalyticsMetricAverage,
	sessionAnalyticsPeriodRollups,
	sessionAnalyticsTrendRollups,
	updateSessionAnalyticsCache,
} from '../src/lib/session-analytics';
import {
	sessionCalendarDays,
	sessionCalendarMonthFromKey,
	sessionCalendarMonthKey,
	sessionsByLocalDate,
} from '../src/lib/session-calendar';
import { savedSessionFixture } from './fixtures/saved-session';

function analyticsSession(
	id: string,
	startedAt: number,
	overrides: Partial<typeof savedSessionFixture> = {}
) {
	return {
		...savedSessionFixture,
		...overrides,
		endedAt:
			startedAt + (overrides.elapsedSeconds ?? savedSessionFixture.elapsedSeconds) * 1000,
		id,
		startedAt,
	};
}

describe('session analytics', () => {
	test('builds cached all-time and calendar-period totals from compact contributions', () => {
		const first = sessionAnalyticsContribution(
			analyticsSession('january', new Date(2026, 0, 5, 8).getTime(), {
				distance: 20,
				elapsedSeconds: 3600,
				elevationTotals: { ascent: 300, descent: 280 },
			})
		);
		const second = sessionAnalyticsContribution(
			analyticsSession('february', new Date(2026, 1, 8, 9).getTime(), {
				calories: 500,
				distance: 40,
				elapsedSeconds: 7200,
				elevationTotals: { ascent: 600, descent: 590 },
			})
		);
		const cache = buildSessionAnalyticsCache([first, second], 1234);

		expect(cache.updatedAt).toBe(1234);
		expect(cache.totals).toMatchObject({
			ascent: 900,
			calories: 720,
			descent: 870,
			distance: 60,
			elapsedSeconds: 10_800,
			sessionCount: 2,
		});
		expect(sessionAnalyticsAverageSpeed(cache.totals)).toBe(20);
		expect(sessionAnalyticsMetricAverage(cache.totals.power)).toBe(205);
		expect(Object.keys(cache.periods.days)).toHaveLength(2);
		expect(Object.keys(cache.periods.weeks)).toHaveLength(2);
		expect(Object.keys(cache.periods.months)).toEqual(['2026-01', '2026-02']);
		expect(Object.keys(cache.periods.years)).toEqual(['2026']);
		expect(
			sessionAnalyticsPeriodRollups(cache, SESSION_ANALYTICS_PERIOD.MONTH).map(([key]) => key)
		).toEqual(['2026-01', '2026-02']);
		expect(cache.peaks[SESSION_ANALYTICS_PEAK.DISTANCE]).toEqual({
			sessionId: 'february',
			value: 40,
		});
		expect(cache.peaks[SESSION_ANALYTICS_PEAK.CLIMB]?.value).toBe(600);
	});

	test('pads trend charts with chronological empty periods', () => {
		const july = sessionAnalyticsContribution(
			analyticsSession('july', new Date(2026, 6, 12, 8).getTime(), {
				distance: 42,
			})
		);
		const cache = buildSessionAnalyticsCache([july]);
		const endTimestamp = new Date(2026, 6, 23, 12).getTime();
		const months = sessionAnalyticsTrendRollups(
			cache,
			SESSION_ANALYTICS_PERIOD.MONTH,
			endTimestamp
		);
		const weeks = sessionAnalyticsTrendRollups(
			cache,
			SESSION_ANALYTICS_PERIOD.WEEK,
			endTimestamp
		);
		const years = sessionAnalyticsTrendRollups(
			cache,
			SESSION_ANALYTICS_PERIOD.YEAR,
			endTimestamp
		);

		expect(months).toHaveLength(12);
		expect(months.at(0)?.[0]).toBe('2025-08');
		expect(months.at(-1)?.[0]).toBe('2026-07');
		expect(months.filter(([, rollup]) => rollup.sessionCount > 0)).toHaveLength(1);
		expect(months.at(-1)?.[1].distance).toBe(42);
		expect(weeks).toHaveLength(12);
		expect(weeks.at(0)?.[0]).toBe('2026-05-04');
		expect(weeks.at(-1)?.[0]).toBe('2026-07-20');
		expect(years.map(([key]) => key)).toEqual([
			'2017',
			'2018',
			'2019',
			'2020',
			'2021',
			'2022',
			'2023',
			'2024',
			'2025',
			'2026',
		]);
	});

	test('shows complete history in chronological yearly buckets', () => {
		const first = sessionAnalyticsContribution(
			analyticsSession('first', new Date(2023, 2, 12, 8).getTime(), {
				distance: 20,
			})
		);
		const latest = sessionAnalyticsContribution(
			analyticsSession('latest', new Date(2025, 8, 4, 8).getTime(), {
				distance: 45,
			})
		);
		const complete = sessionAnalyticsCompleteTrendRollups(
			buildSessionAnalyticsCache([latest, first])
		);

		expect(complete.map(([key]) => key)).toEqual(['2023', '2024', '2025']);
		expect(complete[0]?.[1].distance).toBe(20);
		expect(complete[1]?.[1].sessionCount).toBe(0);
		expect(complete[2]?.[1].distance).toBe(45);
		expect(sessionAnalyticsCompleteTrendRollups(emptySessionAnalyticsCache())).toEqual([]);
	});

	test('updates replacements and deletions without rescanning telemetry histories', () => {
		const original = sessionAnalyticsContribution(
			analyticsSession('ride', new Date(2026, 3, 2, 8).getTime(), {
				distance: 25,
				elevationTotals: { ascent: 500, descent: 450 },
			})
		);
		const other = sessionAnalyticsContribution(
			analyticsSession('other', new Date(2026, 3, 9, 8).getTime(), {
				distance: 10,
				elevationTotals: { ascent: 100, descent: 90 },
			})
		);
		const replacement = sessionAnalyticsContribution(
			analyticsSession('ride', new Date(2026, 4, 2, 8).getTime(), {
				distance: 30,
				elevationTotals: { ascent: 700, descent: 650 },
			})
		);
		const initial = buildSessionAnalyticsCache([original, other], 1);
		const replaced = updateSessionAnalyticsCache(initial, original, replacement, 2);

		expect(replaced.cache.totals.distance).toBe(40);
		expect(replaced.cache.totals.ascent).toBe(800);
		expect(replaced.cache.periods.months['2026-04'].sessionCount).toBe(1);
		expect(replaced.cache.periods.months['2026-05'].sessionCount).toBe(1);
		expect(replaced.peaksNeedRebuild).toBe(true);

		const rebuilt = rebuildSessionAnalyticsPeaks(replaced.cache, [other, replacement]);
		expect(rebuilt.peaks.distance).toEqual({ sessionId: 'ride', value: 30 });
		const deleted = updateSessionAnalyticsCache(rebuilt, replacement, undefined, 3);
		const afterDelete = rebuildSessionAnalyticsPeaks(deleted.cache, [other]);
		expect(afterDelete.totals.distance).toBe(10);
		expect(afterDelete.periods.months['2026-05']).toBeUndefined();
		expect(afterDelete.peaks.distance).toEqual({ sessionId: 'other', value: 10 });
	});

	test('validates analytics records at the IndexedDB boundary', () => {
		const cache = emptySessionAnalyticsCache(42);
		expect(restoreSessionAnalyticsCache(cache)).toEqual(cache);
		expect(restoreSessionAnalyticsCache({ ...cache, schemaVersion: 999 })).toBeUndefined();
		expect(
			restoreSessionAnalyticsCache({ ...cache, totals: { distance: -1 } })
		).toBeUndefined();
	});
});

describe('session calendar data', () => {
	test('round trips linkable calendar months and rejects invalid values', () => {
		const month = sessionCalendarMonthFromKey('2026-07');

		expect(month?.getFullYear()).toBe(2026);
		expect(month?.getMonth()).toBe(6);
		expect(month ? sessionCalendarMonthKey(month) : undefined).toBe('2026-07');
		expect(sessionCalendarMonthFromKey('2026-13')).toBeUndefined();
		expect(sessionCalendarMonthFromKey('July 2026')).toBeUndefined();
	});

	test('builds Monday-first calendar weeks and groups every ride on its local day', () => {
		const first = analyticsSession('morning', new Date(2026, 6, 1, 8).getTime());
		const second = analyticsSession('evening', new Date(2026, 6, 1, 18).getTime());
		const summaries = [sessionSummary(second), sessionSummary(first)];
		const grouped = sessionsByLocalDate(summaries);
		const days = sessionCalendarDays(new Date(2026, 6, 1), summaries);
		const rideDay = days.find((day) => day.date.getDate() === 1 && day.inCurrentMonth);

		expect(days.length % 7).toBe(0);
		expect(days[0].date.getDay()).toBe(1);
		expect(grouped.size).toBe(1);
		expect(rideDay?.sessions.map((session) => session.id)).toEqual(['morning', 'evening']);
	});

	test('shows an overnight ride on every local calendar day it spans', () => {
		const startedAt = new Date(2026, 6, 31, 23).getTime();
		const overnight = sessionSummary(
			analyticsSession('overnight', startedAt, {
				elapsedSeconds: 7200,
			})
		);
		const grouped = sessionsByLocalDate([overnight]);

		expect(grouped.size).toBe(2);
		expect(
			[...grouped.values()].every((sessions) =>
				sessions.some((session) => session.id === overnight.id)
			)
		).toBe(true);
	});
});
