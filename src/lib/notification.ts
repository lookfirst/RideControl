import { MILLISECONDS_PER_SECOND } from './units';

export const NOTICE_AUTO_DISMISS_MS = 15_000;
export const NOTICE_AUTO_DISMISS_SECONDS = NOTICE_AUTO_DISMISS_MS / MILLISECONDS_PER_SECOND;

interface NoticeTimers {
	clearTimeout: (timeout: number) => void;
	setTimeout: (callback: () => void, delay: number) => number;
}

export function scheduleNoticeDismissal(
	notice: string,
	onDismiss: () => void,
	timers: NoticeTimers = window
): (() => void) | undefined {
	if (!notice) {
		return;
	}
	const timeout = timers.setTimeout(onDismiss, NOTICE_AUTO_DISMISS_MS);
	return () => timers.clearTimeout(timeout);
}

export function noticeSecondsRemaining(elapsedMilliseconds: number): number {
	const remaining = NOTICE_AUTO_DISMISS_MS - Math.max(0, elapsedMilliseconds);
	return Math.max(0, Math.ceil(remaining / MILLISECONDS_PER_SECOND));
}
