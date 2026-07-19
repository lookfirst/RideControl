export const MIN_GEAR = 1;
export const MAX_GEAR = 24;
export const DEFAULT_GEAR = 12;
export const RESISTANCE_POINTS_PER_GEAR = 3;

export function clampGear(gear: number): number {
	return Math.max(MIN_GEAR, Math.min(MAX_GEAR, Math.round(gear)));
}

export function gearForResistance(resistance: number): number {
	return clampGear(resistance / RESISTANCE_POINTS_PER_GEAR + 1);
}

export function storedGear(
	storage: Pick<Storage, 'getItem'> = localStorage,
	fallback = DEFAULT_GEAR
): number {
	const saved = Number(storage.getItem('trainer-virtual-gear'));
	return Number.isFinite(saved) && saved > 0 ? clampGear(saved) : clampGear(fallback);
}

export function shiftedGear(current: number, change: number): number {
	return clampGear(current + change);
}

export function resistanceChangeForGears(from: number, to: number): number {
	return (clampGear(to) - clampGear(from)) * RESISTANCE_POINTS_PER_GEAR;
}
