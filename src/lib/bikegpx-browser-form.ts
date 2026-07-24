import { z } from 'zod';
import type { SpeedUnit } from '../types';
import {
	type BikeGpxRouteAnalysis,
	type BikeGpxRouteSummary,
	bikeGpxRouteMatchesQuery,
} from './bikegpx';
import { convertDistance } from './units';
import { isWorkoutDifficulty, type WorkoutDifficulty } from './workout-schema';

const workoutDifficultySchema = z
	.custom<WorkoutDifficulty>(isWorkoutDifficulty, 'Choose a valid route difficulty.')
	.optional();

export const bikeGpxBrowserFormSchema = z.object({
	country: z.string(),
	difficulty: workoutDifficultySchema,
	maximumDistance: z.string(),
	minimumDistance: z.string(),
	query: z.string(),
});

export type BikeGpxBrowserFormValues = z.infer<typeof bikeGpxBrowserFormSchema>;

export function matchingBikeGpxRoutes(
	routes: BikeGpxRouteSummary[],
	values: BikeGpxBrowserFormValues,
	speedUnit: SpeedUnit,
	analyses: Record<string, BikeGpxRouteAnalysis>
): BikeGpxRouteSummary[] {
	const minimum = optionalDistance(values.minimumDistance);
	const maximum = optionalDistance(values.maximumDistance);
	return routes.filter((route) => {
		const analysis = analyses[route.id];
		const displayedDistance = convertDistance(
			analysis?.distance ?? route.distanceKm,
			speedUnit
		);
		return (
			(!values.country || route.country === values.country) &&
			(!values.difficulty || analysis?.difficulty === values.difficulty) &&
			(minimum === undefined || displayedDistance >= minimum) &&
			(maximum === undefined || displayedDistance <= maximum) &&
			bikeGpxRouteMatchesQuery(route, values.query, analysis)
		);
	});
}

function optionalDistance(value: string): number | undefined {
	const normalized = value.trim();
	if (!normalized) {
		return;
	}
	const distance = Number(normalized);
	return Number.isFinite(distance) && distance >= 0 ? distance : undefined;
}
