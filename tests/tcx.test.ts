import { describe, expect, test } from 'bun:test';
import { emptyMetrics } from '../src/constants';
import { sessionTcxFilename, sessionToTcx } from '../src/lib/tcx';
import type { SavedSession } from '../src/types';

const startedAt = Date.UTC(2026, 6, 18, 16);
const session: SavedSession = {
	aggregates: {
		cadence: { count: 2, sum: 162 },
		gear: { count: 0, sum: 0 },
		heartRate: { count: 2, sum: 282 },
		power: { count: 2, sum: 410 },
		resistance: { count: 2, sum: 85 },
	},
	calories: 220,
	comments: 'Hard & fun <again>',
	controlMode: 'resistance',
	distance: 1.5,
	elapsedSeconds: 2,
	endedAt: startedAt + 2000,
	feeling: 'good',
	history: [
		{
			cadence: 80,
			elapsedSeconds: 1,
			heartRate: 140,
			power: 200,
			resistance: 40,
			speed: 28,
		},
		{
			cadence: 82,
			elapsedSeconds: 2,
			heartRate: 142,
			power: 210,
			resistance: 45,
			speed: 30,
		},
	],
	id: 'saved-session',
	maximums: {
		...emptyMetrics,
		cadence: 82,
		heartRate: 142,
		power: 210,
		speed: 30,
	},
	startedAt,
};

describe('TCX export', () => {
	test('exports an indoor cycling activity with standard and Ride Control data', () => {
		const tcx = sessionToTcx(session);
		expect(tcx).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
		expect(tcx).toContain('<Activity Sport="Biking">');
		expect(tcx).toContain('<TotalTimeSeconds>2.000</TotalTimeSeconds>');
		expect(tcx).toContain('<DistanceMeters>1500.000</DistanceMeters>');
		expect(tcx).toContain('<Time>2026-07-18T16:00:01.000Z</Time>');
		expect(tcx).toContain('<HeartRateBpm><Value>142</Value></HeartRateBpm>');
		expect(tcx).toContain('<Cadence>82</Cadence>');
		expect(tcx).toContain('<ns3:Speed>8.333</ns3:Speed>');
		expect(tcx).toContain('<ns3:Watts>210</ns3:Watts>');
		expect(tcx).toContain('<rc:Resistance>45.0</rc:Resistance>');
		expect(tcx).toContain('<rc:AverageResistance>42.5</rc:AverageResistance>');
		expect(tcx).toContain('Comments: Hard &amp; fun &lt;again&gt;');
		expect(tcx).not.toContain('NaN');
	});

	test('creates a filesystem-safe TCX filename', () => {
		expect(sessionTcxFilename(session)).toBe('ride-control-2026-07-18T16-00-00.000Z.tcx');
	});

	test('exports gear instead of resistance for a virtual shifting session', () => {
		const gearSession: SavedSession = {
			...session,
			aggregates: {
				...session.aggregates,
				gear: { count: 2, sum: 27 },
				resistance: { count: 0, sum: 0 },
			},
			controlMode: 'gear',
			history: session.history.map(({ resistance: _resistance, ...sample }, index) => ({
				...sample,
				gear: 13 + index,
			})),
		};
		const tcx = sessionToTcx(gearSession);
		expect(tcx).toContain('<rc:Gear>14</rc:Gear>');
		expect(tcx).toContain('<rc:AverageGear>13.5</rc:AverageGear>');
		expect(tcx).not.toContain('<rc:Resistance>');
	});
});
