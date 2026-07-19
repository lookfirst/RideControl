import { describe, expect, test } from 'bun:test';
import { sessionTcxFilename, sessionToTcx } from '../src/lib/tcx';
import { WORKOUT_COURSES, workoutTerrainAtDistance } from '../src/lib/workouts';
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
		expect(tcx).toContain('<rc:TotalAscentMeters>0.00</rc:TotalAscentMeters>');
		expect(tcx).toContain('<rc:TotalDescentMeters>0.00</rc:TotalDescentMeters>');
		expect(tcx).toContain('<rc:AverageResistance>42.5</rc:AverageResistance>');
		expect(tcx).toContain('<rc:MaximumResistance>45.0</rc:MaximumResistance>');
		expect(tcx).toContain('Comments: Hard &amp; fun &lt;again&gt;');
		expect(tcx).not.toContain('NaN');
	});

	test('creates a filesystem-safe TCX filename', () => {
		expect(sessionTcxFilename(session)).toBe('ride-control-2026-07-18T16-00-00.000Z.tcx');
	});

	test('exports terrain workout metadata and samples', () => {
		const course = WORKOUT_COURSES.find((workout) => workout.id === 'cedar-circuit');
		expect(course).toBeDefined();
		if (!course) {
			return;
		}
		const workoutSession: SavedSession = {
			...session,
			elevationTotals: { ascent: 82.5, descent: 30.25 },
			history: session.history.map((sample, index) => {
				const terrain = workoutTerrainAtDistance(course, index + 0.5);
				return {
					...sample,
					elevation: terrain.elevation,
					grade: terrain.grade,
					workoutDistance: terrain.distance,
					workoutLap: terrain.lap,
				};
			}),
			workout: { course },
		};
		const tcx = sessionToTcx(workoutSession);
		expect(tcx).toContain('<AltitudeMeters>');
		expect(tcx).toContain('<rc:Grade>');
		expect(tcx).toContain('<rc:WorkoutDistance>');
		expect(tcx).toContain('<rc:WorkoutLap>1</rc:WorkoutLap>');
		expect(tcx).toContain('<rc:CourseId>cedar-circuit</rc:CourseId>');
		expect(tcx).toContain('<rc:BaseResistance>12.0</rc:BaseResistance>');
		expect(tcx).toContain('<rc:TotalAscentMeters>82.50</rc:TotalAscentMeters>');
		expect(tcx).toContain('<rc:TotalDescentMeters>30.25</rc:TotalDescentMeters>');
		expect(tcx).toContain('<rc:Name>Cedar Circuit</rc:Name>');
		expect(tcx).toContain('<rc:Point>');
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
