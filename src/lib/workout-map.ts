import type { GeographicRoutePoint } from '../types';

export interface WorkoutMapCoordinate {
	latitude: number;
	longitude: number;
}

export function workoutRouteCoordinateAtProgress(
	points: readonly GeographicRoutePoint[],
	progress: number
): WorkoutMapCoordinate | undefined {
	const [start] = points;
	if (!start) {
		return;
	}
	const finish = points.at(-1) ?? start;
	const routeDistance = finish.distance - start.distance;
	if (routeDistance <= 0) {
		return { latitude: start.latitude, longitude: start.longitude };
	}
	const normalizedProgress = Math.min(1, Math.max(0, progress));
	const targetDistance = start.distance + routeDistance * normalizedProgress;
	const nextIndex = points.findIndex((point) => point.distance >= targetDistance);
	if (nextIndex <= 0) {
		return { latitude: start.latitude, longitude: start.longitude };
	}
	const next = points[nextIndex] ?? finish;
	const previous = points[nextIndex - 1] ?? start;
	const segmentDistance = next.distance - previous.distance;
	const segmentProgress =
		segmentDistance > 0 ? (targetDistance - previous.distance) / segmentDistance : 0;
	return {
		latitude: previous.latitude + (next.latitude - previous.latitude) * segmentProgress,
		longitude: previous.longitude + (next.longitude - previous.longitude) * segmentProgress,
	};
}
