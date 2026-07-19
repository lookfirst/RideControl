import { useCallback, useEffect, useRef, useState } from 'react';
import { gearForResistance, resistanceChangeForGears, shiftedGear, storedGear } from '../lib/gears';
import { resistanceDirectionForKey } from '../lib/resistance';
import type { ResistanceAdjustmentDirection } from '../types';

export function useGearControl({
	active,
	connected,
	keyboardEnabled,
	onResistanceChange,
	resistance,
	setNotice,
}: {
	active: boolean;
	connected: boolean;
	keyboardEnabled: boolean;
	onResistanceChange: (change: number) => void;
	resistance: number;
	setNotice: (notice: string) => void;
}) {
	const [gear, setGear] = useState(() => storedGear(localStorage, gearForResistance(resistance)));
	const [shiftFlash, setShiftFlash] = useState<ResistanceAdjustmentDirection | undefined>();
	const gearRef = useRef(gear);
	const shiftFlashTimer = useRef<number | undefined>(undefined);

	const shiftGear = useCallback(
		(change: number) => {
			if (!connected) {
				setNotice('Connect the trainer before shifting gears.');
				return;
			}
			const previous = gearRef.current;
			const next = shiftedGear(previous, change);
			if (next === previous) {
				return;
			}
			setShiftFlash(change > 0 ? 'increase' : 'decrease');
			window.clearTimeout(shiftFlashTimer.current);
			shiftFlashTimer.current = window.setTimeout(() => setShiftFlash(undefined), 180);
			gearRef.current = next;
			setGear(next);
			localStorage.setItem('trainer-virtual-gear', String(next));
			onResistanceChange(resistanceChangeForGears(previous, next));
		},
		[connected, onResistanceChange, setNotice]
	);

	useEffect(() => {
		if (!active) {
			return;
		}
		const handleGearKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const isGearControl = target?.matches('[data-gear-control="true"]');
			if (
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				!keyboardEnabled ||
				(!isGearControl &&
					target?.matches("input, textarea, select, [contenteditable='true']"))
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
	}, [active, keyboardEnabled, shiftGear]);

	useEffect(
		() => () => {
			window.clearTimeout(shiftFlashTimer.current);
		},
		[]
	);

	return { gear, shiftFlash, shiftGear };
}
