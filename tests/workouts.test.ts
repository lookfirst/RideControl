import { describe, expect, test } from 'bun:test';
import { workoutMaximumGrade } from '../src/lib/workout-metrics';
import { WORKOUT_ROUTE_TYPE } from '../src/lib/workout-schema';
import {
	outAndBackRoutePoints,
	restoreSessionWorkout,
	restoreWorkoutCourse,
	WORKOUT_COURSES,
	WORKOUT_FLAT_START_DISTANCE,
	WORKOUT_MODERATE_FLAT_START_DISTANCE,
	WORKOUT_SHORT_FLAT_START_DISTANCE,
	workoutCompletedLaps,
	workoutDashboardPreview,
	workoutElevationTotalsAtDistance,
	workoutFlatStartDistance,
	workoutLap,
	workoutMapPath,
	workoutMapProgressPath,
	workoutMatchesSearch,
	workoutProfilePath,
	workoutProfilePosition,
	workoutProgress,
	workoutSelectionLocked,
	workoutTerrainAtDistance,
} from '../src/lib/workouts';

const course = WORKOUT_COURSES.find((workout) => workout.id === 'cedar-circuit');

describe('terrain workouts', () => {
	test('previews a newly planned workout instead of the completed course', () => {
		const [completedCourse, plannedCourse] = WORKOUT_COURSES;
		if (!(completedCourse && plannedCourse)) {
			throw new Error('Expected built-in workout courses');
		}
		const completedWorkout = { course: completedCourse };
		const plannedWorkout = { course: plannedCourse };
		expect(
			workoutDashboardPreview({
				distance: 4.2,
				elevationTotals: { ascent: 80, descent: 60 },
				ended: true,
				selectedWorkout: plannedWorkout,
				workout: completedWorkout,
			})
		).toEqual({
			distance: 0,
			elevationTotals: { ascent: 0, descent: 0 },
			workout: plannedWorkout,
		});
		expect(
			workoutDashboardPreview({
				distance: 4.2,
				elevationTotals: { ascent: 80, descent: 60 },
				ended: false,
				selectedWorkout: completedWorkout,
				workout: completedWorkout,
			})
		).toMatchObject({ distance: 4.2, workout: completedWorkout });
		expect(workoutTerrainAtDistance(plannedCourse, 0)).toMatchObject({
			distance: 0,
			progress: 0,
		});
	});

	test('defines built-in courses with useful terrain metadata', () => {
		expect(WORKOUT_COURSES).toHaveLength(6);
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

	test('filters workouts by name and displayed difficulty', () => {
		const prairie = WORKOUT_COURSES.find((workout) => workout.id === 'prairie-roll');
		const granite = WORKOUT_COURSES.find((workout) => workout.id === 'granite-switchbacks');
		if (!(prairie && granite)) {
			throw new Error('Expected Prairie Roll and Granite Switchbacks');
		}
		expect(workoutMatchesSearch(prairie, 'prairie')).toBeTrue();
		expect(workoutMatchesSearch(prairie, 'GENTLE')).toBeTrue();
		expect(workoutMatchesSearch(granite, 'granite challenging')).toBeTrue();
		expect(workoutMatchesSearch(granite, 'gentle')).toBeFalse();
		expect(workoutMatchesSearch(granite, '   ')).toBeTrue();
	});

	test('offers a ten-mile time trial with a mirrored five-mile hillclimb', () => {
		const timeTrial = WORKOUT_COURSES.find((workout) => workout.id === 'ridgeline-time-trial');
		if (!timeTrial) {
			throw new Error('Expected the Ridgeline Time Trial workout course');
		}
		const turnaroundDistance = timeTrial.distance / 2;
		const start = workoutTerrainAtDistance(timeTrial, 0);
		const turnaround = workoutTerrainAtDistance(timeTrial, turnaroundDistance);
		const outbound = workoutTerrainAtDistance(timeTrial, 4.4);
		const returning = workoutTerrainAtDistance(timeTrial, timeTrial.distance - 4.4);
		expect(timeTrial.routeType).toBe(WORKOUT_ROUTE_TYPE.OUT_AND_BACK);
		expect(timeTrial.distance / 1.609_344).toBeCloseTo(10, 5);
		expect(turnaroundDistance / 1.609_344).toBeCloseTo(5, 5);
		expect((turnaround.elevation - start.elevation) * 3.280_84).toBeWithin(285, 300);
		expect(timeTrial.elevationGain * 3.280_84).toBeWithin(300, 335);
		expect(workoutMaximumGrade(timeTrial)).toBeLessThan(3);
		expect(outbound.grade).toBeGreaterThan(0);
		expect(returning.grade).toBeLessThan(0);
		expect(returning.x).toBeCloseTo(outbound.x, 1);
		expect(returning.y).toBeCloseTo(outbound.y, 1);
	});

	test('makes switchback corners briefly steeper during a four-mile climb', () => {
		const switchbacks = WORKOUT_COURSES.find((workout) => workout.id === 'granite-switchbacks');
		if (!switchbacks) {
			throw new Error('Expected the Granite Switchbacks workout course');
		}
		const climbStart = 1.5;
		const climbEnd = 7.94;
		const straightGrade = workoutTerrainAtDistance(switchbacks, 2.7).grade;
		const cornerGrade = workoutTerrainAtDistance(switchbacks, 2.2).grade;
		const smoothedGrade = workoutTerrainAtDistance(switchbacks, 2.47).grade;
		expect((climbEnd - climbStart) / 1.609_344).toBeCloseTo(4, 2);
		expect(cornerGrade).toBeGreaterThan(straightGrade + 2);
		expect(smoothedGrade).toBeCloseTo(straightGrade, 0);
		expect(workoutMaximumGrade(switchbacks)).toBeWithin(9.5, 10.5);
	});

	test('mixes rollers into the Granite Switchbacks descent', () => {
		const switchbacks = WORKOUT_COURSES.find((workout) => workout.id === 'granite-switchbacks');
		if (!switchbacks) {
			throw new Error('Expected the Granite Switchbacks workout course');
		}
		const returnPoints = switchbacks.points.filter((point) => point.distance >= 8.6);
		const elevationChanges = returnPoints.slice(1).map((point, index) => {
			const previous = returnPoints[index];
			return previous ? point.elevation - previous.elevation : 0;
		});
		expect(elevationChanges.filter((change) => change > 0)).toHaveLength(5);
		expect(elevationChanges.filter((change) => change < 0).length).toBeGreaterThan(5);
		expect(returnPoints.at(-1)?.elevation).toBeLessThan(returnPoints[0]?.elevation ?? 0);
	});

	test('traverses out-and-back courses to the turnaround and back to the start', () => {
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const outbound = course.points.slice(0, 6).map(({ x: _x, y: _y, ...point }) => point);
		const points = outAndBackRoutePoints(outbound);
		const distance = points.at(-1)?.distance ?? 0;
		const outAndBack = restoreWorkoutCourse({
			...course,
			distance,
			id: 'ridge-out-and-back',
			points,
			routeType: WORKOUT_ROUTE_TYPE.OUT_AND_BACK,
		});
		if (!outAndBack) {
			throw new Error('Expected a valid out-and-back workout course');
		}
		const outboundPosition = workoutTerrainAtDistance(outAndBack, 2.4);
		const returnPosition = workoutTerrainAtDistance(outAndBack, distance - 2.4);
		expect(outAndBack.distance).toBeCloseTo((outbound.at(-1)?.distance ?? 0) * 2);
		expect(outAndBack.points).toHaveLength(outbound.length * 2 - 1);
		expect(outboundPosition.elevation).toBeCloseTo(returnPosition.elevation);
		expect(outboundPosition.x).toBeCloseTo(returnPosition.x);
		expect(outboundPosition.y).toBeCloseTo(returnPosition.y);
		expect(workoutProgress(outAndBack, distance / 2)).toBeCloseTo(0.5);
		expect(workoutCompletedLaps(outAndBack, distance)).toBe(1);
		expect(workoutTerrainAtDistance(outAndBack, distance).distance).toBe(0);
		expect(workoutMapPath(outAndBack)).toStartWith('M ');
	});

	test('finishes point-to-point courses without wrapping back to the start', () => {
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const sourcePoints = course.points.slice(0, 6).map(({ x: _x, y: _y, ...point }) => point);
		const distance = sourcePoints.at(-1)?.distance ?? 0;
		const pointToPoint = restoreWorkoutCourse({
			...course,
			distance,
			id: 'ridge-point-to-point',
			points: sourcePoints,
			routeType: WORKOUT_ROUTE_TYPE.POINT_TO_POINT,
		});
		if (!pointToPoint) {
			throw new Error('Expected a valid point-to-point workout course');
		}
		const finish = workoutTerrainAtDistance(pointToPoint, distance);
		const beyondFinish = workoutTerrainAtDistance(pointToPoint, distance * 2);
		expect(finish).toMatchObject({ completedLaps: 1, distance, grade: 0, lap: 1, progress: 1 });
		expect(beyondFinish).toEqual(finish);
		expect(workoutLap(pointToPoint, distance * 2)).toBe(1);
		expect(workoutCompletedLaps(pointToPoint, distance * 2)).toBe(1);
		expect(workoutProgress(pointToPoint, distance * 2)).toBe(1);
		expect(workoutElevationTotalsAtDistance(pointToPoint, distance * 2)).toEqual(
			workoutElevationTotalsAtDistance(pointToPoint, distance)
		);
		expect(workoutMapProgressPath(pointToPoint, finish)).toBe(workoutMapPath(pointToPoint));
	});

	test('offers a fifteen-mile course with long rollers centered on 20% resistance', () => {
		const rollingCourse = WORKOUT_COURSES.find((workout) => workout.id === 'prairie-roll');
		if (!rollingCourse) {
			throw new Error('Expected the Prairie Roll workout course');
		}
		const [start] = rollingCourse.points;
		if (!start) {
			throw new Error('Expected Prairie Roll route points');
		}
		expect(
			rollingCourse.points
				.slice(1, -1)
				.every((point) => Math.hypot(point.x - start.x, point.y - start.y) > 1)
		).toBeTrue();
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

	test('keeps gentle elevation profiles visually low beside climbing courses', () => {
		const prairie = WORKOUT_COURSES.find((workout) => workout.id === 'prairie-roll');
		const highland = WORKOUT_COURSES.find((workout) => workout.id === 'highland-loop');
		if (!(prairie && highland)) {
			throw new Error('Expected the Prairie Roll and Highland Loop workout courses');
		}
		const prairiePeak = prairie.points.reduce((peak, point) =>
			point.elevation > peak.elevation ? point : peak
		);
		const highlandPeak = highland.points.reduce((peak, point) =>
			point.elevation > peak.elevation ? point : peak
		);
		const prairiePosition = workoutProfilePosition(
			prairie,
			workoutTerrainAtDistance(prairie, prairiePeak.distance)
		);
		const highlandPosition = workoutProfilePosition(
			highland,
			workoutTerrainAtDistance(highland, highlandPeak.distance)
		);
		expect(prairiePosition.y).toBeGreaterThan(70);
		expect(highlandPosition.y).toBeLessThan(20);
	});

	test('scales the flat rollout to total course climbing before the first hill', () => {
		const harbor = WORKOUT_COURSES.find((workout) => workout.id === 'harbor-ring');
		const cedar = WORKOUT_COURSES.find((workout) => workout.id === 'cedar-circuit');
		const prairie = WORKOUT_COURSES.find((workout) => workout.id === 'prairie-roll');
		expect(harbor && workoutFlatStartDistance(harbor)).toBe(WORKOUT_SHORT_FLAT_START_DISTANCE);
		expect(cedar && workoutFlatStartDistance(cedar)).toBe(WORKOUT_MODERATE_FLAT_START_DISTANCE);
		expect(prairie && workoutFlatStartDistance(prairie)).toBe(WORKOUT_FLAT_START_DISTANCE);
		for (const workout of WORKOUT_COURSES) {
			const startElevation = workout.points[0]?.elevation;
			const rolloutDistance = workoutFlatStartDistance(workout);
			const rolloutPoints = workout.points.filter(
				(point) => point.distance <= rolloutDistance
			);
			expect(rolloutPoints.length).toBeGreaterThan(1);
			expect(rolloutPoints.at(-1)?.distance).toBeCloseTo(rolloutDistance);
			for (const point of rolloutPoints) {
				expect(point.elevation).toBe(startElevation);
			}
			expect(workoutTerrainAtDistance(workout, rolloutDistance / 2).grade).toBeCloseTo(0);
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
		const cedar = WORKOUT_COURSES.find((workout) => workout.id === 'cedar-circuit');
		if (!cedar) {
			throw new Error('Expected Cedar Circuit');
		}
		const roundLegacyCedar = {
			...cedar,
			points: cedar.points.map((point, index, points) => {
				const angle = (Math.PI * 2 * index) / (points.length - 1);
				return {
					distance: point.distance,
					elevation: point.elevation,
					x: 50 + Math.cos(angle) * 40,
					y: 50 + Math.sin(angle) * 28,
				};
			}),
		};
		expect(restoreWorkoutCourse(roundLegacyCedar)).toBeDefined();
		expect(restoreSessionWorkout({ course: roundLegacyCedar })?.course).toBe(cedar);
		expect(restoreWorkoutCourse({ ...course, routeType: undefined })).toMatchObject({
			routeType: WORKOUT_ROUTE_TYPE.LOOP,
		});
		expect(restoreWorkoutCourse({ ...course, routeType: 'somewhere-else' })).toBeUndefined();
		expect(
			restoreWorkoutCourse({ ...course, routeType: WORKOUT_ROUTE_TYPE.OUT_AND_BACK })
		).toBeUndefined();
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
