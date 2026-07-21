import { type RefObject, useEffect, useRef, useState } from 'react';

const TRAY_TRANSITION_MS = 200;

export function useAnimatedTray(open: boolean): {
	rendered: boolean;
	visible: boolean;
} {
	const [rendered, setRendered] = useState(open);
	const [visible, setVisible] = useState(open);

	useEffect(() => {
		let frame: number | undefined;
		let timeout: number | undefined;
		if (open) {
			setRendered(true);
			frame = window.requestAnimationFrame(() => setVisible(true));
		} else {
			setVisible(false);
			timeout = window.setTimeout(() => setRendered(false), TRAY_TRANSITION_MS);
		}
		return () => {
			if (frame !== undefined) {
				window.cancelAnimationFrame(frame);
			}
			if (timeout !== undefined) {
				window.clearTimeout(timeout);
			}
		};
	}, [open]);

	return { rendered, visible };
}

export function useCloseOnEscape(enabled: boolean, onClose: () => void): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
	}, [enabled, onClose]);
}

export function useDialogInitialFocus<T extends HTMLElement>(enabled = true): RefObject<T | null> {
	const target = useRef<T>(null);

	useEffect(() => {
		if (!enabled) {
			return;
		}
		const previousFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const frame = window.requestAnimationFrame(() => target.current?.focus());
		return () => {
			window.cancelAnimationFrame(frame);
			if (previousFocus?.isConnected) {
				previousFocus.focus();
			}
		};
	}, [enabled]);

	return target;
}

export function useBodyScrollLock(locked: boolean): void {
	useEffect(() => {
		if (!locked) {
			return;
		}
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [locked]);
}
