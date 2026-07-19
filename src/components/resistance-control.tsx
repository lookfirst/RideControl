import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { CONTROL_FLASH_MS } from '../constants';
import { clamp } from '../lib/numbers';
import { resistanceAdjustmentDirection } from '../lib/resistance';
import type { ResistanceAdjustmentDirection, ResistanceRamp } from '../types';
import { Icon } from './icon';

export function ResistanceControl({
	value,
	min,
	max,
	step,
	onChange,
	disabled,
	keyboardFlash,
	ramp,
}: {
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
	disabled: boolean;
	keyboardFlash?: ResistanceAdjustmentDirection;
	ramp: ResistanceRamp;
}) {
	const [sliderFlash, setSliderFlash] = useState<ResistanceAdjustmentDirection>();
	const sliderDragging = useRef(false);
	const sliderFlashTimer = useRef<number | undefined>(undefined);
	const sliderValue = useRef(value);
	const rampProgress = ramp.phase === 'settled' ? 1 : clamp(ramp.progress, 0, 1);
	const rampProgressPercent = Math.round(rampProgress * 100);
	const sliderPosition = max > min ? clamp((value - min) / (max - min), 0, 1) * 100 : 0;
	const sliderStyle = {
		'--ramp-progress': `${rampProgress * 360}deg`,
		'--resistance-position': `${sliderPosition}%`,
	} as CSSProperties;
	const buttonClass =
		'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-slate-300 transition duration-150 hover:border-mint disabled:opacity-40';
	const keyboardFlashClass =
		'scale-105 border-mint bg-mint/15 text-mint shadow-[0_0_14px_rgba(190,242,100,.4)]';
	const activeFlash = keyboardFlash ?? sliderFlash;

	useEffect(() => {
		sliderValue.current = value;
	}, [value]);

	useEffect(
		() => () => {
			window.clearTimeout(sliderFlashTimer.current);
		},
		[]
	);

	const clearSliderFlash = () => {
		sliderDragging.current = false;
		window.clearTimeout(sliderFlashTimer.current);
		sliderFlashTimer.current = window.setTimeout(
			() => setSliderFlash(undefined),
			CONTROL_FLASH_MS
		);
	};

	const handleSliderChange = (next: number) => {
		const direction = resistanceAdjustmentDirection(sliderValue.current, next);
		sliderValue.current = next;
		if (direction) {
			window.clearTimeout(sliderFlashTimer.current);
			setSliderFlash(direction);
			if (!sliderDragging.current) {
				sliderFlashTimer.current = window.setTimeout(
					() => setSliderFlash(undefined),
					CONTROL_FLASH_MS
				);
			}
		}
		onChange(next);
	};

	return (
		<div className="mt-4">
			<div className="flex items-center gap-3">
				<button
					aria-label="Decrease resistance"
					className={`${buttonClass} ${activeFlash === 'decrease' ? keyboardFlashClass : ''}`}
					data-keyboard-flash={activeFlash === 'decrease' || undefined}
					disabled={disabled}
					onClick={() => onChange(value - step)}
					type="button"
				>
					<Icon className="h-4 w-4" name="minus" />
				</button>
				<input
					aria-label="Resistance"
					className="resistance-slider w-full min-w-0 disabled:opacity-40"
					data-ramp-active={ramp.phase === 'ramping' || undefined}
					data-ramp-progress={rampProgressPercent}
					data-resistance-control="true"
					disabled={disabled}
					max={max}
					min={min}
					onBlur={clearSliderFlash}
					onChange={(event) => handleSliderChange(Number(event.target.value))}
					onPointerCancel={clearSliderFlash}
					onPointerDown={() => {
						sliderDragging.current = true;
					}}
					onPointerUp={clearSliderFlash}
					step={step}
					style={sliderStyle}
					type="range"
					value={value}
				/>
				<button
					aria-label="Increase resistance"
					className={`${buttonClass} ${activeFlash === 'increase' ? keyboardFlashClass : ''}`}
					data-keyboard-flash={activeFlash === 'increase' || undefined}
					disabled={disabled}
					onClick={() => onChange(value + step)}
					type="button"
				>
					<Icon className="h-4 w-4" name="plus" />
				</button>
			</div>
		</div>
	);
}
