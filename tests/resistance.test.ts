import { describe, expect, test } from 'bun:test';
import {
	resistanceAdjustmentDirection,
	resistanceDirectionForKey,
	resistanceRampDuration,
	smoothedResistance,
} from '../src/lib/resistance';

describe('resistance smoothing', () => {
	test('maps resistance movement to adjustment directions', () => {
		expect(resistanceAdjustmentDirection(20, 21)).toBe('increase');
		expect(resistanceAdjustmentDirection(20, 19)).toBe('decrease');
		expect(resistanceAdjustmentDirection(20, 20)).toBeUndefined();
	});

	test('maps arrow keys to resistance adjustment directions', () => {
		expect(resistanceDirectionForKey('ArrowUp')).toBe('increase');
		expect(resistanceDirectionForKey('ArrowDown')).toBe('decrease');
		expect(resistanceDirectionForKey('Enter')).toBeUndefined();
	});

	test('scales and clamps the ramp duration', () => {
		expect(resistanceRampDuration(20, 21)).toBe(600);
		expect(resistanceRampDuration(20, 60)).toBe(1800);
		expect(resistanceRampDuration(0, 100)).toBe(3000);
	});

	test('smooths both increasing and decreasing resistance', () => {
		expect(smoothedResistance(20, 60, 0)).toBe(20);
		expect(smoothedResistance(20, 60, 0.5)).toBe(40);
		expect(smoothedResistance(20, 60, 1)).toBe(60);
		expect(smoothedResistance(60, 20, 0.5)).toBe(40);
		expect(smoothedResistance(20, 60, -1)).toBe(20);
		expect(smoothedResistance(20, 60, 2)).toBe(60);
	});
});
