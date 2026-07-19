import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_GEAR, MIN_GEAR } from '../lib/gears';
import type { ResistanceAdjustmentDirection } from '../types';
import { Icon } from './icon';

const HOLD_DELAY_MS = 420;
const HOLD_REPEAT_MS = 180;

export function GearControl({
	disabled,
	gear,
	onChange,
	shiftFlash,
}: {
	disabled: boolean;
	gear: number;
	onChange: (change: number) => void;
	shiftFlash?: ResistanceAdjustmentDirection;
}) {
	const [heldDirection, setHeldDirection] = useState<ResistanceAdjustmentDirection>();
	const holdDelay = useRef<number | undefined>(undefined);
	const holdRepeat = useRef<number | undefined>(undefined);

	const clearHoldTimers = useCallback(() => {
		window.clearTimeout(holdDelay.current);
		window.clearInterval(holdRepeat.current);
		holdDelay.current = undefined;
		holdRepeat.current = undefined;
	}, []);

	const stopHolding = useCallback(() => {
		clearHoldTimers();
		setHeldDirection(undefined);
	}, [clearHoldTimers]);

	const startHolding = useCallback(
		(
			change: number,
			direction: ResistanceAdjustmentDirection,
			event: React.PointerEvent<HTMLButtonElement>
		) => {
			if (event.button !== 0) {
				return;
			}
			event.preventDefault();
			clearHoldTimers();
			setHeldDirection(direction);
			onChange(change);
			holdDelay.current = window.setTimeout(() => {
				onChange(change);
				holdRepeat.current = window.setInterval(() => onChange(change), HOLD_REPEAT_MS);
			}, HOLD_DELAY_MS);
		},
		[clearHoldTimers, onChange]
	);

	useEffect(() => clearHoldTimers, [clearHoldTimers]);

	useEffect(() => {
		if (
			disabled ||
			(heldDirection === 'decrease' && gear === MIN_GEAR) ||
			(heldDirection === 'increase' && gear === MAX_GEAR)
		) {
			stopHolding();
		}
	}, [disabled, gear, heldDirection, stopHolding]);

	const progress = ((gear - MIN_GEAR) / (MAX_GEAR - MIN_GEAR)) * 100;
	const activeDirection = heldDirection ?? shiftFlash;
	const buttonClass =
		'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-slate-300 transition duration-150 hover:border-mint disabled:opacity-40';
	const activeClass =
		'scale-105 border-mint bg-mint/15 text-mint shadow-[0_0_14px_rgba(190,242,100,.4)]';
	return (
		<div className="mt-4" data-gear-control="true">
			<div className="flex items-center gap-3">
				<button
					aria-label="Shift to an easier gear"
					className={`${buttonClass} ${activeDirection === 'decrease' ? activeClass : ''}`}
					disabled={disabled || gear === MIN_GEAR}
					onClick={(event) => {
						if (event.detail === 0) {
							onChange(-1);
						}
					}}
					onLostPointerCapture={stopHolding}
					onPointerCancel={stopHolding}
					onPointerDown={(event) => startHolding(-1, 'decrease', event)}
					onPointerLeave={stopHolding}
					onPointerUp={stopHolding}
					type="button"
				>
					<Icon className="h-4 w-4" name="minus" />
				</button>
				<div className="min-w-0 flex-1">
					<div className="relative h-2 overflow-hidden rounded-full bg-slate-700">
						<div
							aria-hidden="true"
							className="absolute inset-y-0 left-0 rounded-full bg-mint transition-[width] duration-150"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="mt-2 flex justify-between font-bold text-[9px] text-slate-500 tracking-[.12em]">
						<span>EASIER</span>
						<span>HARDER</span>
					</div>
				</div>
				<button
					aria-label="Shift to a harder gear"
					className={`${buttonClass} ${activeDirection === 'increase' ? activeClass : ''}`}
					disabled={disabled || gear === MAX_GEAR}
					onClick={(event) => {
						if (event.detail === 0) {
							onChange(1);
						}
					}}
					onLostPointerCapture={stopHolding}
					onPointerCancel={stopHolding}
					onPointerDown={(event) => startHolding(1, 'increase', event)}
					onPointerLeave={stopHolding}
					onPointerUp={stopHolding}
					type="button"
				>
					<Icon className="h-4 w-4" name="plus" />
				</button>
			</div>
			{disabled ? null : (
				<p className="mt-3 text-center text-[11px] text-slate-500">
					Use Zwift Click or <kbd className="font-mono text-slate-400">↑</kbd>{' '}
					<kbd className="font-mono text-slate-400">↓</kbd> to shift
				</p>
			)}
		</div>
	);
}
