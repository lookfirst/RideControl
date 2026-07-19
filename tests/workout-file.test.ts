import { describe, expect, test } from 'bun:test';
import { DOMParser } from '@xmldom/xmldom';
import {
	addCustomWorkout,
	CUSTOM_WORKOUTS_STORAGE_KEY,
	loadCustomWorkouts,
	parseWorkoutFile,
	readWorkoutFile,
	saveCustomWorkouts,
	WORKOUT_GPX_EXTENSION_NAMESPACE,
	withoutCustomWorkout,
	workoutFileContents,
	workoutFilename,
} from '../src/lib/workout-file';
import { WORKOUT_ROUTE_TYPE } from '../src/lib/workout-schema';
import { WORKOUT_COURSES } from '../src/lib/workouts';
import type { WorkoutCourse } from '../src/types';

Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: DOMParser });

function customWorkout(): WorkoutCourse {
	const [builtIn] = WORKOUT_COURSES;
	if (!builtIn) {
		throw new Error('Expected a built-in workout course');
	}
	return {
		...builtIn,
		id: 'ridge-river-test',
		name: 'Ridge & River / Test',
	};
}

function thirdPartyGpx(name = 'Neighborhood loop'): string {
	return `<?xml version="1.0"?>
<gpx version="1.1" creator="Bike computer" xmlns="http://www.topografix.com/GPX/1/1">
	<trk>
		<name>${name}</name>
		<desc>A real GPX loop</desc>
		<trkseg>
			<trkpt lat="37.000000" lon="-122.000000"><ele>12</ele></trkpt>
			<trkpt lat="37.001000" lon="-122.000000"><ele>22</ele></trkpt>
			<trkpt lat="37.001000" lon="-122.001000"><ele>18</ele></trkpt>
			<trkpt lat="37.000000" lon="-122.000000"><ele>12</ele></trkpt>
		</trkseg>
	</trk>
</gpx>`;
}

function openThirdPartyGpx(): string {
	return `<?xml version="1.0"?>
<gpx version="1.1" creator="Bike computer" xmlns="http://www.topografix.com/GPX/1/1">
	<trk>
		<name>Ridgeline turnaround</name>
		<desc>A point-to-point GPX track</desc>
		<trkseg>
			<trkpt lat="37.000000" lon="-122.000000"><ele>12</ele></trkpt>
			<trkpt lat="37.020000" lon="-122.000000"><ele>22</ele></trkpt>
			<trkpt lat="37.020000" lon="-122.020000"><ele>18</ele></trkpt>
			<trkpt lat="37.040000" lon="-122.040000"><ele>12</ele></trkpt>
		</trkseg>
	</trk>
</gpx>`;
}

describe('workout GPX files', () => {
	test('round trips geographic workout source data through standard GPX', async () => {
		const workout = customWorkout();
		const contents = workoutFileContents(workout);
		expect(contents).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
		expect(contents).toContain('<gpx version="1.1"');
		expect(contents).toContain(`xmlns:rc="${WORKOUT_GPX_EXTENSION_NAMESPACE}"`);
		expect(contents).toContain('<rc:FormatVersion>2</rc:FormatVersion>');
		expect(contents).toContain('<trkpt lat=');
		expect(contents).toContain('<ele>');
		expect(contents).toContain('<rc:BaseResistance>12.0</rc:BaseResistance>');
		expect(contents).toContain('<rc:CourseType>loop</rc:CourseType>');
		expect(contents).not.toContain('elevationGain');
		expect(contents).not.toContain('<rc:X>');
		const parsed = parseWorkoutFile(
			contents,
			new DOMParser() as unknown as globalThis.DOMParser
		);
		expect(parsed).toMatchObject({
			baseResistance: workout.baseResistance,
			description: workout.description,
			difficulty: workout.difficulty,
			distance: workout.distance,
			id: workout.id,
			name: workout.name,
			routeType: WORKOUT_ROUTE_TYPE.LOOP,
		});
		expect(parsed.points).toHaveLength(workout.points.length);
		expect(parsed.points[1]?.latitude).toBeCloseTo(workout.points[1]?.latitude ?? 0, 7);
		expect(await readWorkoutFile({ name: 'route.gpx', text: async () => contents })).toEqual(
			parsed
		);
		expect(workoutFilename(workout)).toBe('ride-control-ridge-river-test.gpx');
		expect(workoutFilename({ id: 'safe-fallback', name: '///' })).toBe(
			'ride-control-safe-fallback.gpx'
		);
	});

	test('imports ordinary GPX loops with a stable generated identifier', () => {
		const parser = new DOMParser() as unknown as globalThis.DOMParser;
		const first = parseWorkoutFile(thirdPartyGpx(), parser);
		const second = parseWorkoutFile(thirdPartyGpx('Renamed metadata'), parser);
		expect(first).toMatchObject({
			baseResistance: 12,
			description: 'A real GPX loop',
			difficulty: 'moderate',
			name: 'Neighborhood loop',
			routeType: WORKOUT_ROUTE_TYPE.LOOP,
		});
		expect(first.id).toStartWith('gpx-');
		expect(second.id).toBe(first.id);
	});

	test('imports open GPX tracks as complete out-and-back courses', () => {
		const parser = new DOMParser() as unknown as globalThis.DOMParser;
		const workout = parseWorkoutFile(openThirdPartyGpx(), parser);
		const turnaroundIndex = (workout.points.length - 1) / 2;
		const turnaround = workout.points[turnaroundIndex];
		expect(workout).toMatchObject({
			name: 'Ridgeline turnaround',
			routeType: WORKOUT_ROUTE_TYPE.OUT_AND_BACK,
		});
		expect(workout.points).toHaveLength(9);
		expect(turnaround?.distance).toBeCloseTo(workout.distance / 2);
		expect(workout.points.at(-1)).toMatchObject({
			elevation: workout.points[0]?.elevation,
			latitude: workout.points[0]?.latitude,
			longitude: workout.points[0]?.longitude,
		});
		expect(workout.points.map((point) => point.elevation)).toEqual([
			12, 12, 22, 18, 12, 18, 22, 12, 12,
		]);

		const exported = workoutFileContents(workout);
		expect(exported).toContain('<rc:CourseType>out-and-back</rc:CourseType>');
		const roundTripped = parseWorkoutFile(exported, parser);
		expect(roundTripped).toMatchObject({
			description: workout.description,
			id: workout.id,
			name: workout.name,
			routeType: WORKOUT_ROUTE_TYPE.OUT_AND_BACK,
		});
		expect(roundTripped.distance).toBeCloseTo(workout.distance, 5);
		expect(roundTripped.points).toHaveLength(workout.points.length);
		for (const [index, point] of roundTripped.points.entries()) {
			expect(point.distance).toBeCloseTo(workout.points[index]?.distance ?? 0, 5);
			expect(point.elevation).toBeCloseTo(workout.points[index]?.elevation ?? 0);
		}
	});

	test('rejects malformed and built-in workout imports', async () => {
		await expect(
			readWorkoutFile({ name: 'broken.gpx', text: async () => '<gpx><broken' })
		).rejects.toThrow();
		const [builtIn] = WORKOUT_COURSES;
		if (!builtIn) {
			throw new Error('Expected a built-in workout course');
		}
		expect(() => addCustomWorkout([], builtIn)).toThrow(
			`${builtIn.name} is already included with Ride Control.`
		);
	});

	test('persists, restores, rejects duplicates, and removes custom workouts by stable id', () => {
		const workout = customWorkout();
		let saved = '';
		const storage = {
			getItem: (key: string) => (key === CUSTOM_WORKOUTS_STORAGE_KEY ? saved : null),
			setItem: (key: string, value: string) => {
				if (key === CUSTOM_WORKOUTS_STORAGE_KEY) {
					saved = value;
				}
			},
		};
		const imported = addCustomWorkout([], workout);
		saveCustomWorkouts(imported.courses, storage);
		expect(loadCustomWorkouts(storage)).toEqual([workout]);

		const renamed = { ...workout, name: 'Renamed route' };
		expect(() => addCustomWorkout(imported.courses, renamed)).toThrow(
			`${workout.name} has already been imported.`
		);
		expect(withoutCustomWorkout(imported.courses, workout.id)).toEqual([]);
	});
});
