import { describe, expect, test } from 'bun:test';
import { sessionTcxFilename, sessionToTcx } from '../src/lib/tcx';
import type { SavedSession } from '../src/types';
import { savedSessionFixture as session } from './fixtures/saved-session';

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
		expect(tcx).toContain('<rc:SessionId>saved-session</rc:SessionId>');
		expect(tcx).toContain('<rc:AverageResistance>42.5</rc:AverageResistance>');
		expect(tcx).toContain('<rc:MaximumResistance>45.0</rc:MaximumResistance>');
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
				gear: { count: 2, maximum: 14, sum: 27 },
				resistance: { count: 0, maximum: 0, sum: 0 },
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
		expect(tcx).toContain('<rc:MaximumGear>14</rc:MaximumGear>');
		expect(tcx).not.toContain('<rc:Resistance>');
	});
});
