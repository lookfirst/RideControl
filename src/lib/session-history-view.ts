import { z } from 'zod';

export const SESSION_HISTORY_VIEW = {
	CALENDAR: 'calendar',
	LIST: 'list',
	STATISTICS: 'statistics',
} as const;

export type SessionHistoryView = (typeof SESSION_HISTORY_VIEW)[keyof typeof SESSION_HISTORY_VIEW];

export const sessionHistoryViewSchema = z.enum([
	SESSION_HISTORY_VIEW.CALENDAR,
	SESSION_HISTORY_VIEW.LIST,
	SESSION_HISTORY_VIEW.STATISTICS,
]);

export const SESSION_HISTORY_VIEW_OPTIONS: { label: string; value: SessionHistoryView }[] = [
	{ label: 'Calendar', value: SESSION_HISTORY_VIEW.CALENDAR },
	{ label: 'List', value: SESSION_HISTORY_VIEW.LIST },
	{ label: 'Statistics', value: SESSION_HISTORY_VIEW.STATISTICS },
];

const SESSION_HISTORY_VIEW_STORAGE_KEY = 'ride-control-session-history-view';

export function isSessionHistoryView(value: string | null): value is SessionHistoryView {
	return sessionHistoryViewSchema.safeParse(value).success;
}

export function loadSessionHistoryView(
	storage: Pick<Storage, 'getItem'> = localStorage
): SessionHistoryView {
	try {
		const value = storage.getItem(SESSION_HISTORY_VIEW_STORAGE_KEY);
		return isSessionHistoryView(value) ? value : SESSION_HISTORY_VIEW.CALENDAR;
	} catch {
		return SESSION_HISTORY_VIEW.CALENDAR;
	}
}

export function saveSessionHistoryView(
	view: SessionHistoryView,
	storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
	try {
		storage.setItem(SESSION_HISTORY_VIEW_STORAGE_KEY, view);
		return true;
	} catch {
		return false;
	}
}
