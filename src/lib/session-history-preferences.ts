import {
	ACTIVITY_FILE_FORMAT,
	type ActivityFileFormat,
	isActivityFileFormat,
} from './activity-file';

export const SESSION_HISTORY_SCROLL_POSITION_STORAGE_KEY =
	'ride-control-session-history-scroll-position';
export const SESSION_HISTORY_SELECTION_STORAGE_KEY = 'ride-control-selected-session';
export const SESSION_HISTORY_DOWNLOAD_FORMAT_STORAGE_KEY = 'ride-control-session-download-format';
const SESSION_DETAIL_SCROLL_POSITION_STORAGE_KEY_PREFIX =
	'ride-control-session-detail-scroll-position';

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
