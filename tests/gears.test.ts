import { describe, expect, test } from 'bun:test';
import {
	clampGear,
	DEFAULT_GEAR,
	MAX_GEAR,
	MIN_GEAR,
	resistanceAfterGearShift,
	resistanceForVirtualGear,
	shiftedGear,
	storedGear,
	virtualGearRatio,
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

	test('starts in the neutral gear when no virtual gear is remembered', () => {
		expect(storedGear({ getItem: () => null })).toBe(DEFAULT_GEAR);
	});

	test('uses evenly spaced ratios across the 24-gear range', () => {
		expect(virtualGearRatio(DEFAULT_GEAR)).toBe(1);
		expect(virtualGearRatio(MAX_GEAR)).toBe(2);
		expect(virtualGearRatio(MIN_GEAR)).toBeCloseTo(0.53, 2);
		expect(virtualGearRatio(13) / virtualGearRatio(12)).toBeCloseTo(
			virtualGearRatio(12) / virtualGearRatio(11),
			10
		);
	});

	test('scales terrain resistance around neutral gear and clamps trainer targets', () => {
		expect(resistanceForVirtualGear(30, DEFAULT_GEAR)).toBe(30);
		expect(resistanceForVirtualGear(30, MAX_GEAR)).toBe(60);
		expect(resistanceForVirtualGear(30, MIN_GEAR)).toBe(15.9);
		expect(resistanceForVirtualGear(80, MAX_GEAR)).toBe(100);
	});

	test('applies the same ratio curve to consecutive free-ride shifts', () => {
		const harder = resistanceAfterGearShift(30, 12, 13);
		expect(harder).toBe(31.8);
		expect(resistanceAfterGearShift(harder, 13, 12)).toBeCloseTo(30, 1);
		expect(resistanceAfterGearShift(3, 12, 1)).toBe(1.6);
	});
});
