import { describe, expect, test } from 'bun:test';
import { workoutRouteCoordinateAtProgress } from '../src/lib/workout-map';

describe('workout route maps', () => {
	test('interpolates an animated bike position through route distances', () => {
		const points = [
			{ distance: 0, elevation: 0, latitude: 10, longitude: 20 },
			{ distance: 2, elevation: 5, latitude: 12, longitude: 24 },
			{ distance: 6, elevation: 3, latitude: 16, longitude: 28 },
		];
		expect(workoutRouteCoordinateAtProgress(points, -1)).toEqual({
			latitude: 10,
			longitude: 20,
		});
		expect(workoutRouteCoordinateAtProgress(points, 0.5)).toEqual({
			latitude: 13,
			longitude: 25,
		});
		expect(workoutRouteCoordinateAtProgress(points, 2)).toEqual({
			latitude: 16,
			longitude: 28,
		});
		expect(workoutRouteCoordinateAtProgress([], 0.5)).toBeUndefined();
	});
});
