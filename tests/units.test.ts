import { describe, expect, test } from 'bun:test';
import {
	averageSpeed,
	convertDistance,
	convertElevation,
	convertSpeed,
	descriptionWithoutDistance,
	formatDescriptionDistance,
	formatDistance,
	formatDistanceProgress,
	formatDistanceValue,
	formatElevation,
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
		expect(convertElevation(304.8, 'mph')).toBeCloseTo(1000);
		expect(convertSpeed(32.186_88, 'mph')).toBeCloseTo(20);
		expect(formatDistance(16.093_44, 'mph')).toBe('10.00 mi');
		expect(formatDistance(16.093_44, 'kmh')).toBe('16.09 km');
		expect(formatDistanceProgress(5.793_638_4, 9.656_064, 'mph')).toBe('3.60 / 6.00 mi');
		expect(formatDistanceProgress(3.6, 6, 'kmh')).toBe('3.60 / 6.00 km');
		expect(formatDistanceValue(16.093_44, 'mph')).toBe('10.00');
		expect(formatElevation(304.8, 'mph')).toBe('1000 ft');
		expect(formatElevation(304.8, 'kmh')).toBe('305 m');
	});

	test('formats a route description distance in the selected dashboard unit', () => {
		expect(formatDescriptionDistance('Near Saltvik → Near Finström — 11 km', 11, 'mph')).toBe(
			'Near Saltvik → Near Finström — 7 mi'
		);
		expect(formatDescriptionDistance('Near Saltvik → Near Finström — 11 km', 11, 'kmh')).toBe(
			'Near Saltvik → Near Finström — 11 km'
		);
		expect(formatDescriptionDistance('Original terrain workout', 11, 'mph')).toBe(
			'Original terrain workout'
		);
		expect(descriptionWithoutDistance('Near Saltvik → Near Finström — 11 km')).toBe(
			'Near Saltvik → Near Finström'
		);
		expect(descriptionWithoutDistance('Original terrain workout')).toBe(
			'Original terrain workout'
		);
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
