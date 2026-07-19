export const JOULES_PER_KILOCALORIE = 4184;
export const ESTIMATED_CYCLING_EFFICIENCY = 0.24;

export function estimatedCyclingCalories(powerWatts: number, seconds: number): number {
	return powerWatts > 0
		? (powerWatts * seconds) / (JOULES_PER_KILOCALORIE * ESTIMATED_CYCLING_EFFICIENCY)
		: 0;
}
