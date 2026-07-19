interface ReconnectControllerOptions<T> {
	attempt: (target: T) => Promise<boolean>;
	canRetry: (target: T) => boolean;
	clearTimer?: typeof clearTimeout;
	delayForAttempt: (attempt: number) => number;
	onWaiting?: (target: T) => void;
	setTimer?: typeof setTimeout;
}

interface RetryEntry<T> {
	attempt: number;
	target: T;
	timer?: ReturnType<typeof setTimeout>;
}

export interface ReconnectController<T> {
	cancel: (key: string, resetAttempts?: boolean) => void;
	cancelAll: () => void;
	isPending: (key: string) => boolean;
	reset: (key: string) => void;
	start: (key: string, target: T, initialDelay?: number) => void;
}

export function createReconnectController<T>({
	attempt,
	canRetry,
	clearTimer = clearTimeout,
	delayForAttempt,
	onWaiting,
	setTimer = setTimeout,
}: ReconnectControllerOptions<T>): ReconnectController<T> {
	const entries = new Map<string, RetryEntry<T>>();

	const cancel = (key: string, resetAttempts = false) => {
		const entry = entries.get(key);
		if (entry?.timer) {
			clearTimer(entry.timer);
		}
		if (resetAttempts) {
			entries.delete(key);
		} else if (entry) {
			entry.timer = undefined;
		}
	};

	const schedule = (key: string, entry: RetryEntry<T>, delay: number) => {
		if (!canRetry(entry.target)) {
			entries.delete(key);
			return;
		}
		onWaiting?.(entry.target);
		entry.timer = setTimer(async () => {
			entry.timer = undefined;
			if (entries.get(key) !== entry || !canRetry(entry.target)) {
				entries.delete(key);
				return;
			}
			const connected = await attempt(entry.target).catch(() => false);
			if (entries.get(key) !== entry) {
				return;
			}
			if (connected) {
				entries.delete(key);
				return;
			}
			entry.attempt += 1;
			schedule(key, entry, delayForAttempt(entry.attempt));
		}, delay);
	};

	return {
		cancel,
		cancelAll: () => {
			for (const key of entries.keys()) {
				cancel(key, true);
			}
		},
		isPending: (key) => Boolean(entries.get(key)?.timer),
		reset: (key) => cancel(key, true),
		start: (key, target, initialDelay = 0) => {
			const current = entries.get(key);
			if (current?.timer) {
				return;
			}
			const entry = current ?? { attempt: 1, target };
			entry.target = target;
			entries.set(key, entry);
			schedule(key, entry, initialDelay || delayForAttempt(entry.attempt));
		},
	};
}
