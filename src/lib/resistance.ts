import type { ResistanceAdjustmentDirection } from '../types';
import { clamp } from './numbers';

export const MIN_RESISTANCE = 0;
export const MAX_RESISTANCE = 100;
export const DEFAULT_RESISTANCE = 10;

export function clampResistance(resistance: number): number {
	return clamp(resistance, MIN_RESISTANCE, MAX_RESISTANCE);
}

export function resistanceAdjustmentDirection(
	from: number,
	to: number
): ResistanceAdjustmentDirection | undefined {
	if (to > from) {
		return 'increase';
	}
	if (to < from) {
		return 'decrease';
	}
}

export function resistanceDirectionForKey(key: string): ResistanceAdjustmentDirection | undefined {
	if (key === 'ArrowUp') {
		return 'increase';
	}
	if (key === 'ArrowDown') {
		return 'decrease';
	}
}

export function resistanceRampDuration(from: number, to: number): number {
	return Math.max(600, Math.min(3000, Math.abs(to - from) * 45));
}

export function smoothedResistance(from: number, to: number, progress: number): number {
	const boundedProgress = clamp(progress, 0, 1);
	const eased = boundedProgress * boundedProgress * (3 - 2 * boundedProgress);
	return from + (to - from) * eased;
}
