import { describe, expect, test } from 'bun:test';
import {
	averageSpeed,
	convertDistance,
	convertSpeed,
	formatDistance,
	formatDistanceValue,
	kilometersForMeters,
	kilometersTraveled,
	metersForKilometers,
	metersPerSecond,
	millisecondsForSeconds,
	secondsForMilliseconds,
	storedSpeedUnit,
} from '../src/lib/units';

describe('unit conversions', () => {
	test('converts metric ride values to imperial display values', () => {
		expect(convertDistance(1.609_344, 'mph')).toBeCloseTo(1);
		expect(convertSpeed(32.186_88, 'mph')).toBeCloseTo(20);
		expect(formatDistance(16.093_44, 'mph')).toBe('10.00 mi');
		expect(formatDistance(16.093_44, 'kmh')).toBe('16.09 km');
		expect(formatDistanceValue(16.093_44, 'mph')).toBe('10.00');
	});

	test('converts stored SI and ride timing values consistently', () => {
		expect(metersForKilometers(2.5)).toBe(2500);
		expect(kilometersForMeters(2500)).toBe(2.5);
		expect(metersPerSecond(36)).toBe(10);
		expect(millisecondsForSeconds(2.5)).toBe(2500);
		expect(secondsForMilliseconds(2500)).toBe(2.5);
		expect(kilometersTraveled(30, 1800)).toBe(15);
		expect(averageSpeed(15, 1800)).toBe(30);
	});

	test('restores supported speed units with the existing mph fallback', () => {
		expect(storedSpeedUnit({ getItem: () => 'kmh' })).toBe('kmh');
		expect(storedSpeedUnit({ getItem: () => 'mph' })).toBe('mph');
		expect(storedSpeedUnit({ getItem: () => null })).toBe('mph');
	});
});
