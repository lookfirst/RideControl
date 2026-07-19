import { describe, expect, test } from 'bun:test';
import {
	restoreSessionWorkout,
	restoreWorkoutCourse,
	WORKOUT_COURSES,
	WORKOUT_FLAT_START_DISTANCE,
	workoutCompletedLaps,
	workoutElevationTotalsAtDistance,
	workoutLap,
	workoutMapPath,
	workoutMapProgressPath,
	workoutMaximumGrade,
	workoutProfilePath,
	workoutProgress,
	workoutSelectionLocked,
	workoutTerrainAtDistance,
} from '../src/lib/workouts';

const course = WORKOUT_COURSES.find((workout) => workout.id === 'cedar-circuit');

describe('terrain workouts', () => {
	test('defines original closed-loop courses with useful terrain metadata', () => {
		expect(WORKOUT_COURSES).toHaveLength(4);
		for (const workout of WORKOUT_COURSES) {
			expect(workout.distance).toBeGreaterThan(0);
			expect(workout.elevationGain).toBeGreaterThan(0);
			expect(workout.points[0]).toMatchObject({
				x: workout.points.at(-1)?.x,
				y: workout.points.at(-1)?.y,
			});
			expect(workout.points.at(-1)?.distance).toBe(workout.distance);
			expect(workoutMaximumGrade(workout)).toBeGreaterThan(0);
		}
	});

	test('offers a fifteen-mile course with long rollers centered on 20% resistance', () => {
		const rollingCourse = WORKOUT_COURSES.find((workout) => workout.id === 'prairie-roll');
		if (!rollingCourse) {
			throw new Error('Expected the Prairie Roll workout course');
		}
		const resistances = Array.from(
			{ length: 500 },
			(_, index) =>
				workoutTerrainAtDistance(rollingCourse, (rollingCourse.distance * index) / 499)
					.resistance
		);
		const average =
			resistances.reduce((sum, resistance) => sum + resistance, 0) / resistances.length;
		expect(rollingCourse.distance).toBeCloseTo(24.140_16);
		expect(rollingCourse.baseResistance).toBe(20);
		expect(Math.min(...resistances)).toBeWithin(14, 17);
		expect(Math.max(...resistances)).toBeWithin(24, 26);
		expect(average).toBeWithin(19, 21);
	});

	test('starts every course with a flat rollout before the first hill', () => {
		for (const workout of WORKOUT_COURSES) {
			const startElevation = workout.points[0]?.elevation;
			const rolloutPoints = workout.points.filter(
				(point) => point.distance <= WORKOUT_FLAT_START_DISTANCE
			);
			expect(rolloutPoints.length).toBeGreaterThan(1);
			for (const point of rolloutPoints) {
				expect(point.elevation).toBe(startElevation);
			}
			expect(
				workoutTerrainAtDistance(workout, WORKOUT_FLAT_START_DISTANCE / 2).grade
			).toBeCloseTo(0);
		}
	});

	test('loops progress and advances lap counts from total ride distance', () => {
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		expect(workoutProgress(course, course.distance / 2)).toBeCloseTo(0.5);
		expect(workoutCompletedLaps(course, course.distance - 0.01)).toBe(0);
		expect(workoutLap(course, course.distance - 0.01)).toBe(1);
		expect(workoutCompletedLaps(course, course.distance)).toBe(1);
		expect(workoutLap(course, course.distance)).toBe(2);
		expect(workoutCompletedLaps(course, course.distance * 2.25)).toBe(2);
		expect(workoutProgress(course, course.distance * 2.25)).toBeCloseTo(0.25);
	});

	test('repeats the elevation profile across the complete ride history', () => {
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const firstLap = [0.4, 2.3, 5.7].map(
			(distance) => workoutTerrainAtDistance(course, distance).elevation
		);
		const thirdLap = [0.4, 2.3, 5.7].map(
			(distance) => workoutTerrainAtDistance(course, course.distance * 2 + distance).elevation
		);
		for (const [index, elevation] of thirdLap.entries()) {
			expect(elevation).toBeCloseTo(firstLap[index] ?? 0);
		}
	});

	test('derives climbing totals from course distance without exceeding the lap climb', () => {
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		for (let step = 0; step < 100; step += 1) {
			const totals = workoutElevationTotalsAtDistance(course, (course.distance * step) / 100);
			expect(totals.ascent).toBeLessThanOrEqual(course.elevationGain);
		}
		expect(workoutElevationTotalsAtDistance(course, 3.2)).toEqual({
			ascent: 36,
			descent: 24,
		});
		expect(workoutElevationTotalsAtDistance(course, course.distance * 2)).toEqual({
			ascent: course.elevationGain * 2,
			descent: course.elevationGain * 2,
		});
	});

	test('locks workout selection from the first riding state until the session ends', () => {
		expect(workoutSelectionLocked({ elapsedSeconds: 0, ended: false, isRiding: false })).toBe(
			false
		);
		expect(workoutSelectionLocked({ elapsedSeconds: 0, ended: false, isRiding: true })).toBe(
			true
		);
		expect(workoutSelectionLocked({ elapsedSeconds: 30, ended: false, isRiding: false })).toBe(
			true
		);
		expect(workoutSelectionLocked({ elapsedSeconds: 30, ended: true, isRiding: false })).toBe(
			false
		);
	});

	test('interpolates terrain and maps grade to bounded resistance', () => {
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const climb = workoutTerrainAtDistance(course, 1.8);
		const descent = workoutTerrainAtDistance(course, 2.8);
		expect(climb.grade).toBeGreaterThan(0);
		expect(climb.resistance).toBeGreaterThan(descent.resistance);
		expect(climb.progress).toBeCloseTo(1.8 / course.distance);
		expect(climb.completedLaps).toBe(0);
		expect(climb.lap).toBe(1);
		expect(climb.x).toBeWithin(0, 100);
		expect(climb.y).toBeWithin(0, 100);
	});

	test('creates reusable top-down and side-profile paths', () => {
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		expect(workoutMapPath(course)).toStartWith('M ');
		expect(workoutMapPath(course)).toContain('C ');
		expect(workoutMapPath(course)).not.toContain(' L ');
		expect(workoutProfilePath(course)).toStartWith('M 0 ');
		expect(workoutProfilePath(course)).toContain('C ');
		expect(workoutProfilePath(course)).not.toContain(' L ');
		const terrain = workoutTerrainAtDistance(course, 2.8);
		const progressPath = workoutMapProgressPath(course, terrain);
		expect(progressPath).toContain('C ');
		expect(progressPath).toEndWith(
			`${Number(terrain.x.toFixed(3))} ${Number(terrain.y.toFixed(3))}`
		);
	});

	test('validates persisted workout definitions at the storage boundary', () => {
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		expect(restoreWorkoutCourse(course)).toEqual(course);
		expect(restoreSessionWorkout({ course })).toEqual({ course });
		expect(restoreWorkoutCourse({ ...course, baseResistance: undefined })).toMatchObject({
			baseResistance: 12,
		});
		expect(restoreWorkoutCourse({ ...course, baseResistance: 101 })).toBeUndefined();
		expect(restoreWorkoutCourse({ ...course, distance: 'far' })).toBeUndefined();
		expect(restoreSessionWorkout({ course: { ...course, points: [] } })).toBeUndefined();
		expect(restoreWorkoutCourse({ ...course, id: ' ' })).toBeUndefined();
		expect(
			restoreWorkoutCourse({
				...course,
				points: [
					course.points[0],
					course.points[2],
					course.points[1],
					...course.points.slice(3),
				],
			})
		).toBeUndefined();
		expect(
			restoreWorkoutCourse({
				...course,
				points: course.points.map((point, index) =>
					index === course.points.length - 1
						? { ...point, longitude: point.longitude + 1 }
						: point
				),
			})
		).toBeUndefined();
	});
});
