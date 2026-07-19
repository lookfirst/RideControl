import { describe, expect, test } from 'bun:test';
import {
	clampGear,
	DEFAULT_GEAR,
	gearForResistance,
	MAX_GEAR,
	MIN_GEAR,
	resistanceChangeForGears,
	shiftedGear,
	storedGear,
} from '../src/lib/gears';

describe('virtual gears', () => {
	test('clamps gear positions to the supported 1–24 range', () => {
		expect(clampGear(-4)).toBe(MIN_GEAR);
		expect(clampGear(8.6)).toBe(9);
		expect(clampGear(40)).toBe(MAX_GEAR);
		expect(shiftedGear(1, -1)).toBe(1);
		expect(shiftedGear(23, 1)).toBe(24);
	});

	test('restores a valid gear and falls back to the middle gear', () => {
		expect(storedGear({ getItem: () => '18' })).toBe(18);
		expect(storedGear({ getItem: () => 'invalid' })).toBe(DEFAULT_GEAR);
		expect(storedGear({ getItem: () => '0' })).toBe(DEFAULT_GEAR);
	});

	test('starts near the trainer resistance when no virtual gear is remembered', () => {
		expect(gearForResistance(0)).toBe(1);
		expect(gearForResistance(10)).toBe(4);
		expect(gearForResistance(100)).toBe(24);
		expect(storedGear({ getItem: () => null }, gearForResistance(10))).toBe(4);
	});

	test('maps each shift to a quick three-point resistance change', () => {
		expect(resistanceChangeForGears(12, 13)).toBe(3);
		expect(resistanceChangeForGears(12, 10)).toBe(-6);
	});
});
