import { describe, expect, test } from 'bun:test';
import { chartPath, roundedChartMaximum, storedChartMode } from '../src/lib/chart';
import { formatAggregateAverage, formatChartSeconds, formatDuration } from '../src/lib/format';

describe('format utilities', () => {
	test('formats ride durations', () => {
		expect(formatDuration(3661.9)).toBe('01:01:01');
	});

	test('formats chart timestamps and clamps negatives', () => {
		expect(formatChartSeconds(61.6)).toBe('1:02');
		expect(formatChartSeconds(-4)).toBe('0:00');
	});

	test('formats aggregate averages', () => {
		expect(formatAggregateAverage({ count: 2, sum: 11 }, 1)).toBe('5.5');
		expect(formatAggregateAverage({ count: 0, sum: 0 }, 0)).toBe('0');
	});
});

describe('chart utilities', () => {
	test('creates paths with evenly spaced positions', () => {
		expect(chartPath([0, 50, 100], 0, 100)).toBe('M 0 90 L 50 52 L 100 14');
	});

	test('uses elapsed positions and clamps values', () => {
		expect(chartPath([-10, 50, 120], 0, 100, [10, 20, 50])).toBe('M 0 90 L 25 52 L 100 14');
		expect(chartPath([], 0, 1)).toBe('');
	});

	test('leaves gaps when a control metric is not recorded', () => {
		expect(chartPath([10, undefined, 12], 1, 24, [1, 2, 3])).toBe(
			'M 0 60.26086956521739 M 100 53.65217391304348'
		);
	});

	test('rounds maxima up by chart step', () => {
		expect(roundedChartMaximum(121, 100, 50)).toBe(150);
		expect(roundedChartMaximum(20, 100, 50)).toBe(100);
	});

	test('restores only supported chart modes', () => {
		expect(storedChartMode({ getItem: () => 'power' })).toBe('power');
		expect(storedChartMode({ getItem: () => 'resistance' })).toBe('resistance');
		expect(storedChartMode({ getItem: () => 'gear' })).toBe('gear');
		expect(storedChartMode({ getItem: () => 'elevation' })).toBe('all');
	});
});
