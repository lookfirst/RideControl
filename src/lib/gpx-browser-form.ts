import { z } from 'zod';
import type { SpeedUnit } from '../types';
import { type GpxRouteAnalysis, type GpxRouteSummary, gpxRouteMatchesQuery } from './gpx-provider';
import { convertDistance } from './units';
import { isWorkoutDifficulty, type WorkoutDifficulty } from './workout-schema';

const workoutDifficultySchema = z
	.custom<WorkoutDifficulty>(isWorkoutDifficulty, 'Choose a valid route difficulty.')
	.optional();

export const gpxBrowserFormSchema = z.object({
	difficulty: workoutDifficultySchema,
	group: z.string(),
	maximumDistance: z.string(),
	minimumDistance: z.string(),
	query: z.string(),
});

export type GpxBrowserFormValues = z.infer<typeof gpxBrowserFormSchema>;

export function matchingGpxRoutes(
	routes: GpxRouteSummary[],
	values: GpxBrowserFormValues,
	speedUnit: SpeedUnit,
	analyses: Record<string, GpxRouteAnalysis>
): GpxRouteSummary[] {
	const minimum = optionalDistance(values.minimumDistance);
	const maximum = optionalDistance(values.maximumDistance);
	return routes.filter((route) => {
		const analysis = analyses[route.id];
		const displayedDistance = convertDistance(
			analysis?.distance ?? route.distanceKm,
			speedUnit
		);
		return (
			(!values.group || route.group === values.group) &&
			(!values.difficulty || analysis?.difficulty === values.difficulty) &&
			(minimum === undefined || displayedDistance >= minimum) &&
			(maximum === undefined || displayedDistance <= maximum) &&
			gpxRouteMatchesQuery(route, values.query, analysis)
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
