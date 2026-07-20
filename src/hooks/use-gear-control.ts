import { useCallback, useEffect, useRef, useState } from 'react';
import { CONTROL_FLASH_MS } from '../constants';
import { eventTargetsEditableControl, keyboardEventHasModifiers } from '../lib/dom';
import {
	GEAR_STORAGE_KEY,
	SHIFTING_CONNECTION_MESSAGE,
	shiftedGear,
	storedGear,
} from '../lib/gears';
import { resistanceDirectionForKey } from '../lib/resistance';
import type { ResistanceAdjustmentDirection } from '../types';

export function useGearControl({
	active,
	onGearChange,
	ready,
	setNotice,
}: {
	active: boolean;
	onGearChange: (fromGear: number, toGear: number) => void;
	ready: boolean;
	setNotice: (notice: string) => void;
}) {
	const [gear, setGear] = useState(() => storedGear());
	const [shiftFlash, setShiftFlash] = useState<ResistanceAdjustmentDirection | undefined>();
	const gearRef = useRef(gear);
	const keyboardControlsEnabled = useRef(true);
	const shiftFlashTimer = useRef<number | undefined>(undefined);

	const shiftGear = useCallback(
		(change: number) => {
			if (!ready) {
				setNotice(SHIFTING_CONNECTION_MESSAGE);
				return;
			}
			const previous = gearRef.current;
			const next = shiftedGear(previous, change);
			if (next === previous) {
				return;
			}
			setShiftFlash(change > 0 ? 'increase' : 'decrease');
			window.clearTimeout(shiftFlashTimer.current);
			shiftFlashTimer.current = window.setTimeout(
				() => setShiftFlash(undefined),
				CONTROL_FLASH_MS
			);
			gearRef.current = next;
			setGear(next);
			localStorage.setItem(GEAR_STORAGE_KEY, String(next));
			onGearChange(previous, next);
		},
		[onGearChange, ready, setNotice]
	);

	useEffect(() => {
		if (!active) {
			return;
		}
		const handleGearKey = (event: KeyboardEvent) => {
			const isGearControl =
				event.target instanceof HTMLElement &&
				event.target.matches('[data-gear-control="true"]');
			if (
				event.defaultPrevented ||
				keyboardEventHasModifiers(event) ||
				!keyboardControlsEnabled.current ||
				(!isGearControl && eventTargetsEditableControl(event))
			) {
				return;
			}
			const direction = resistanceDirectionForKey(event.key);
			if (!direction) {
				return;
			}
			event.preventDefault();
			shiftGear(direction === 'increase' ? 1 : -1);
		};
		window.addEventListener('keydown', handleGearKey);
		return () => {
			window.removeEventListener('keydown', handleGearKey);
		};
	}, [active, shiftGear]);

	useEffect(
		() => () => {
			window.clearTimeout(shiftFlashTimer.current);
		},
		[]
	);

	const setKeyboardControlsEnabled = useCallback((enabled: boolean) => {
		keyboardControlsEnabled.current = enabled;
	}, []);

	return { gear, setKeyboardControlsEnabled, shiftFlash, shiftGear };
}
