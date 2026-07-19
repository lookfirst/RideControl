import { describe, expect, test } from 'bun:test';
import { DOMParser } from '@xmldom/xmldom';
import { distanceBetween, parseGpx } from '../src/lib/gpx';

const TRACK_GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
	<trk>
		<name>Test route</name>
		<trkseg>
			<trkpt lat="37" lon="-122"><ele>10</ele></trkpt>
			<trkpt lat="37.001" lon="-122"><ele>20</ele></trkpt>
			<trkpt lat="37" lon="-122"><ele>10</ele></trkpt>
		</trkseg>
	</trk>
</gpx>`;

describe('GPX utilities', () => {
	test('computes great-circle distance', () => {
		expect(distanceBetween(0, 0, 0, 1)).toBeCloseTo(111_194.9, 0);
		expect(distanceBetween(34, -118, 34, -118)).toBe(0);
	});

	test('parses geographic route points, elevation, and cumulative kilometers', () => {
		const route = parseGpx(TRACK_GPX, new DOMParser() as unknown as globalThis.DOMParser);
		expect(route[0]).toEqual({
			distance: 0,
			elevation: 10,
			latitude: 37,
			longitude: -122,
		});
		expect(route[1]?.distance).toBeCloseTo(0.111, 2);
		expect(route[1]?.elevation).toBe(20);
		expect(route[2]?.distance).toBeCloseTo(0.222, 2);
	});

	test('requires elevation data on every GPX route point', () => {
		const missingElevation = TRACK_GPX.replace('<ele>20</ele>', '');
		expect(() =>
			parseGpx(missingElevation, new DOMParser() as unknown as globalThis.DOMParser)
		).toThrow('Every GPX route point must include valid coordinates and elevation data.');
	});
});
