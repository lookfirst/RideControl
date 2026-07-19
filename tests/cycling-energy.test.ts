import { describe, expect, test } from 'bun:test';
import {
	ESTIMATED_CYCLING_EFFICIENCY,
	estimatedCyclingCalories,
	JOULES_PER_KILOCALORIE,
} from '../src/lib/cycling-energy';

describe('cycling energy estimates', () => {
	test('converts mechanical work into estimated dietary calories', () => {
		const seconds = 3600;
		const powerWatts = 200;
		const expected =
			(powerWatts * seconds) / (JOULES_PER_KILOCALORIE * ESTIMATED_CYCLING_EFFICIENCY);

		expect(estimatedCyclingCalories(powerWatts, seconds)).toBe(expected);
		expect(estimatedCyclingCalories(0, seconds)).toBe(0);
	});
});
