import type { ResistanceAdjustmentDirection } from '../types';

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
	const boundedProgress = Math.max(0, Math.min(1, progress));
	const eased = boundedProgress * boundedProgress * (3 - 2 * boundedProgress);
	return from + (to - from) * eased;
}
