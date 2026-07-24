import { describe, expect, test } from 'bun:test';
import { ACTIVITY_FILE_FORMAT } from '../src/lib/activity-file';
import { SESSION_TREND_METRIC } from '../src/lib/session-analytics';
import {
	loadSelectedSessionId,
	loadSessionDownloadFormat,
	loadSessionTrendMetric,
	loadSessionTrendRange,
	SESSION_HISTORY_DOWNLOAD_FORMAT_STORAGE_KEY,
	SESSION_HISTORY_SELECTION_STORAGE_KEY,
	SESSION_TREND_METRIC_SELECTION,
	SESSION_TREND_METRIC_STORAGE_KEY,
	SESSION_TREND_RANGE,
	SESSION_TREND_RANGE_STORAGE_KEY,
	saveSelectedSessionId,
	saveSessionDownloadFormat,
	saveSessionTrendMetric,
	saveSessionTrendRange,
	sessionDetailScrollPositionStorageKey,
} from '../src/lib/session-history-preferences';
import {
	loadSessionHistoryView,
	SESSION_HISTORY_VIEW,
	saveSessionHistoryView,
} from '../src/lib/session-history-view';

describe('session history preferences', () => {
	test('gives each session detail pane an independent scroll position key', () => {
		expect(sessionDetailScrollPositionStorageKey('session-1')).toBe(
			'ride-control-session-detail-scroll-position:session-1'
		);
		expect(sessionDetailScrollPositionStorageKey('session-2')).not.toBe(
			sessionDetailScrollPositionStorageKey('session-1')
		);
	});

	test('persists, restores, and clears the selected session', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => values.delete(key),
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadSelectedSessionId(storage)).toBeUndefined();
		expect(saveSelectedSessionId('session-42', storage)).toBe(true);
		expect(values.get(SESSION_HISTORY_SELECTION_STORAGE_KEY)).toBe('session-42');
		expect(loadSelectedSessionId(storage)).toBe('session-42');
		expect(saveSelectedSessionId(undefined, storage)).toBe(true);
		expect(loadSelectedSessionId(storage)).toBeUndefined();
	});

	test('handles unavailable browser storage', () => {
		const storage = {
			getItem: () => {
				throw new Error('Unavailable');
			},
			removeItem: () => {
				throw new Error('Unavailable');
			},
			setItem: () => {
				throw new Error('Unavailable');
			},
		};

		expect(loadSelectedSessionId(storage)).toBeUndefined();
		expect(saveSelectedSessionId('session-42', storage)).toBe(false);
		expect(loadSessionDownloadFormat(storage)).toBe(ACTIVITY_FILE_FORMAT.TCX);
		expect(saveSessionDownloadFormat(ACTIVITY_FILE_FORMAT.FIT, storage)).toBe(false);
		expect(loadSessionTrendRange(storage)).toBe(SESSION_TREND_RANGE.MONTH);
		expect(saveSessionTrendRange(SESSION_TREND_RANGE.ALL, storage)).toBe(false);
		expect(loadSessionTrendMetric(storage)).toBe(SESSION_TREND_METRIC_SELECTION.ALL);
		expect(saveSessionTrendMetric(SESSION_TREND_METRIC.DISTANCE, storage)).toBe(false);
	});

	test('defaults to the calendar and remembers the selected history view', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadSessionHistoryView(storage)).toBe(SESSION_HISTORY_VIEW.CALENDAR);
		expect(saveSessionHistoryView(SESSION_HISTORY_VIEW.STATISTICS, storage)).toBe(true);
		expect(loadSessionHistoryView(storage)).toBe(SESSION_HISTORY_VIEW.STATISTICS);
		values.set('ride-control-session-history-view', 'unknown');
		expect(loadSessionHistoryView(storage)).toBe(SESSION_HISTORY_VIEW.CALENDAR);
	});

	test('defaults downloads to TCX and remembers the selected format', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadSessionDownloadFormat(storage)).toBe(ACTIVITY_FILE_FORMAT.TCX);
		expect(saveSessionDownloadFormat(ACTIVITY_FILE_FORMAT.FIT, storage)).toBe(true);
		expect(values.get(SESSION_HISTORY_DOWNLOAD_FORMAT_STORAGE_KEY)).toBe(
			ACTIVITY_FILE_FORMAT.FIT
		);
		expect(loadSessionDownloadFormat(storage)).toBe(ACTIVITY_FILE_FORMAT.FIT);
		values.set(SESSION_HISTORY_DOWNLOAD_FORMAT_STORAGE_KEY, 'pdf');
		expect(loadSessionDownloadFormat(storage)).toBe(ACTIVITY_FILE_FORMAT.TCX);
	});

	test('remembers the selected Trends metric and timeframe', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadSessionTrendRange(storage)).toBe(SESSION_TREND_RANGE.MONTH);
		expect(loadSessionTrendMetric(storage)).toBe(SESSION_TREND_METRIC_SELECTION.ALL);
		expect(saveSessionTrendRange(SESSION_TREND_RANGE.YEAR, storage)).toBe(true);
		expect(saveSessionTrendMetric(SESSION_TREND_METRIC.AVERAGE_POWER, storage)).toBe(true);
		expect(values.get(SESSION_TREND_RANGE_STORAGE_KEY)).toBe(SESSION_TREND_RANGE.YEAR);
		expect(values.get(SESSION_TREND_METRIC_STORAGE_KEY)).toBe(
			SESSION_TREND_METRIC.AVERAGE_POWER
		);
		expect(loadSessionTrendRange(storage)).toBe(SESSION_TREND_RANGE.YEAR);
		expect(loadSessionTrendMetric(storage)).toBe(SESSION_TREND_METRIC.AVERAGE_POWER);

		values.set(SESSION_TREND_RANGE_STORAGE_KEY, 'decade');
		values.set(SESSION_TREND_METRIC_STORAGE_KEY, 'speediest');
		expect(loadSessionTrendRange(storage)).toBe(SESSION_TREND_RANGE.MONTH);
		expect(loadSessionTrendMetric(storage)).toBe(SESSION_TREND_METRIC_SELECTION.ALL);
	});
});
