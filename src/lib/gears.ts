import { clamp } from './numbers';

export const MIN_GEAR = 1;
export const MAX_GEAR = 24;
export const DEFAULT_GEAR = 12;
export const RESISTANCE_POINTS_PER_GEAR = 3;
export const GEAR_STORAGE_KEY = 'trainer-virtual-gear';
export const SHIFTING_CONNECTION_MESSAGE =
	'Connect the trainer and controllers before shifting gears.';

export function clampGear(gear: number): number {
	return clamp(Math.round(gear), MIN_GEAR, MAX_GEAR);
}

export function gearForResistance(resistance: number): number {
	return clampGear(resistance / RESISTANCE_POINTS_PER_GEAR + 1);
}

export function storedGear(
	storage: Pick<Storage, 'getItem'> = localStorage,
	fallback = DEFAULT_GEAR
): number {
	const saved = Number(storage.getItem(GEAR_STORAGE_KEY));
	return Number.isFinite(saved) && saved > 0 ? clampGear(saved) : clampGear(fallback);
}

export function shiftedGear(current: number, change: number): number {
	return clampGear(current + change);
}

export function resistanceChangeForGears(from: number, to: number): number {
	return (clampGear(to) - clampGear(from)) * RESISTANCE_POINTS_PER_GEAR;
}
