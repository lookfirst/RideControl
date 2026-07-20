import { clamp } from './numbers';
import { clampResistance } from './resistance';

export const MIN_GEAR = 1;
export const MAX_GEAR = 24;
export const DEFAULT_GEAR = 12;
export const GEAR_STORAGE_KEY = 'trainer-virtual-gear';
export const SHIFTING_CONNECTION_MESSAGE =
	'Connect the trainer and controllers before shifting gears.';

const GEAR_STEPS_PER_RESISTANCE_DOUBLING = 12;
const RESISTANCE_PRECISION = 10;

export function clampGear(gear: number): number {
	return clamp(Math.round(gear), MIN_GEAR, MAX_GEAR);
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

export function virtualGearRatio(gear: number): number {
	return 2 ** ((clampGear(gear) - DEFAULT_GEAR) / GEAR_STEPS_PER_RESISTANCE_DOUBLING);
}

function roundedResistance(resistance: number): number {
	return Math.round(clampResistance(resistance) * RESISTANCE_PRECISION) / RESISTANCE_PRECISION;
}

export function resistanceForVirtualGear(baseResistance: number, gear: number): number {
	return roundedResistance(baseResistance * virtualGearRatio(gear));
}

export function resistanceAfterGearShift(
	resistance: number,
	fromGear: number,
	toGear: number
): number {
	return roundedResistance(resistance * (virtualGearRatio(toGear) / virtualGearRatio(fromGear)));
}
