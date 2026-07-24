import {
	ACTIVITY_FILE_FORMAT,
	type ActivityFileFormat,
	isActivityFileFormat,
} from './activity-file';
import {
	SESSION_ANALYTICS_PERIOD,
	SESSION_TREND_METRIC,
	type SessionTrendMetric,
} from './session-analytics';
import { isString } from './type-guards';

export const SESSION_HISTORY_SCROLL_POSITION_STORAGE_KEY =
	'ride-control-session-history-scroll-position';
export const SESSION_HISTORY_SELECTION_STORAGE_KEY = 'ride-control-selected-session';
export const SESSION_HISTORY_DOWNLOAD_FORMAT_STORAGE_KEY = 'ride-control-session-download-format';
export const SESSION_TREND_RANGE_STORAGE_KEY = 'ride-control-session-trend-range';
export const SESSION_TREND_METRIC_STORAGE_KEY = 'ride-control-session-trend-metric';
const SESSION_DETAIL_SCROLL_POSITION_STORAGE_KEY_PREFIX =
	'ride-control-session-detail-scroll-position';

export const SESSION_TREND_RANGE = {
	...SESSION_ANALYTICS_PERIOD,
	ALL: 'all',
} as const;

export type SessionTrendRange = (typeof SESSION_TREND_RANGE)[keyof typeof SESSION_TREND_RANGE];

export const SESSION_TREND_METRIC_SELECTION = {
	ALL: 'all',
} as const;

export type SessionTrendMetricSelection =
	| SessionTrendMetric
	| (typeof SESSION_TREND_METRIC_SELECTION)[keyof typeof SESSION_TREND_METRIC_SELECTION];

const SESSION_TREND_RANGES: readonly SessionTrendRange[] = Object.values(SESSION_TREND_RANGE);
const SESSION_TREND_METRICS: readonly SessionTrendMetric[] = Object.values(SESSION_TREND_METRIC);

function isSessionTrendRange(value: unknown): value is SessionTrendRange {
	return isString(value) && SESSION_TREND_RANGES.some((range) => range === value);
}

function isSessionTrendMetricSelection(value: unknown): value is SessionTrendMetricSelection {
	return (
		value === SESSION_TREND_METRIC_SELECTION.ALL ||
		(isString(value) && SESSION_TREND_METRICS.some((metric) => metric === value))
	);
}

export function sessionDetailScrollPositionStorageKey(sessionId: string): string {
	return `${SESSION_DETAIL_SCROLL_POSITION_STORAGE_KEY_PREFIX}:${sessionId}`;
}

export function loadSelectedSessionId(
	storage: Pick<Storage, 'getItem'> = localStorage
): string | undefined {
	try {
		return storage.getItem(SESSION_HISTORY_SELECTION_STORAGE_KEY) || undefined;
	} catch {
		// Browser privacy settings can make local storage unavailable.
	}
}

export function saveSelectedSessionId(
	sessionId: string | undefined,
	storage: Pick<Storage, 'removeItem' | 'setItem'> = localStorage
): boolean {
	try {
		if (sessionId) {
			storage.setItem(SESSION_HISTORY_SELECTION_STORAGE_KEY, sessionId);
		} else {
			storage.removeItem(SESSION_HISTORY_SELECTION_STORAGE_KEY);
		}
		return true;
	} catch {
		return false;
	}
}

export function loadSessionDownloadFormat(
	storage: Pick<Storage, 'getItem'> = localStorage
): ActivityFileFormat {
	try {
		const format = storage.getItem(SESSION_HISTORY_DOWNLOAD_FORMAT_STORAGE_KEY);
		return format && isActivityFileFormat(format) ? format : ACTIVITY_FILE_FORMAT.TCX;
	} catch {
		return ACTIVITY_FILE_FORMAT.TCX;
	}
}

export function saveSessionDownloadFormat(
	format: ActivityFileFormat,
	storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
	try {
		storage.setItem(SESSION_HISTORY_DOWNLOAD_FORMAT_STORAGE_KEY, format);
		return true;
	} catch {
		return false;
	}
}

export function loadSessionTrendRange(
	storage: Pick<Storage, 'getItem'> = localStorage
): SessionTrendRange {
	try {
		const range = storage.getItem(SESSION_TREND_RANGE_STORAGE_KEY);
		return isSessionTrendRange(range) ? range : SESSION_TREND_RANGE.MONTH;
	} catch {
		return SESSION_TREND_RANGE.MONTH;
	}
}

export function saveSessionTrendRange(
	range: SessionTrendRange,
	storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
	try {
		storage.setItem(SESSION_TREND_RANGE_STORAGE_KEY, range);
		return true;
	} catch {
		return false;
	}
}

export function loadSessionTrendMetric(
	storage: Pick<Storage, 'getItem'> = localStorage
): SessionTrendMetricSelection {
	try {
		const metric = storage.getItem(SESSION_TREND_METRIC_STORAGE_KEY);
		return isSessionTrendMetricSelection(metric) ? metric : SESSION_TREND_METRIC_SELECTION.ALL;
	} catch {
		return SESSION_TREND_METRIC_SELECTION.ALL;
	}
}

export function saveSessionTrendMetric(
	metric: SessionTrendMetricSelection,
	storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
	try {
		storage.setItem(SESSION_TREND_METRIC_STORAGE_KEY, metric);
		return true;
	} catch {
		return false;
	}
}
