import type { WorkoutCourse, WorkoutRoutePoint } from '../types';
import { isFiniteNumber, isRecord, isString } from './type-guards';
import { KILOMETERS_PER_MILE } from './units';
import { isWorkoutDifficulty, type WorkoutDifficulty } from './workout-schema';

export const BIKEGPX_ROUTES_URL = 'https://bikegpx.com/bike_routes/';
const SEARCH_WHITESPACE = /\s+/u;
const NUMERIC_ROUTE_ID = /^\d+$/;
const API_ROOT = (import.meta.env.VITE_RIDECONTROL_API_URL || '/api').replace(/\/$/u, '');

export interface BikeGpxRouteSummary {
	country: string;
	distanceKm: number;
	id: string;
	name: string;
	summary: string;
}

export interface BikeGpxCatalog {
	analyses: Record<string, BikeGpxRouteAnalysis>;
	fetchedAt: number;
	routes: BikeGpxRouteSummary[];
}

export interface BikeGpxRouteAnalysis {
	difficulty: WorkoutDifficulty;
	elevationGain: number;
	maximumGrade: number;
}

export interface BikeGpxRouteResult {
	analysis: BikeGpxRouteAnalysis;
	course: WorkoutCourse;
}

export function bikeGpxRouteMatchesQuery(
	route: BikeGpxRouteSummary,
	query: string,
	analysis?: BikeGpxRouteAnalysis
): boolean {
	const terms = query.trim().toLocaleLowerCase().split(SEARCH_WHITESPACE).filter(Boolean);
	if (terms.length === 0) {
		return true;
	}
	const miles = route.distanceKm / KILOMETERS_PER_MILE;
	const difficulty = analysis?.difficulty ?? 'uncategorized';
	const searchable =
		`${route.name} ${route.country} ${route.summary} ${difficulty} ${route.distanceKm.toFixed(1)} ${route.distanceKm.toFixed(0)} ${route.distanceKm.toFixed(1)}km ${route.distanceKm.toFixed(0)}km km kilometer kilometers ${miles.toFixed(1)} ${miles.toFixed(0)} ${miles.toFixed(1)}mi ${miles.toFixed(0)}mi mi mile miles`.toLocaleLowerCase();
	return terms.every((term) => searchable.includes(term));
}

function routeAnalysis(value: unknown): BikeGpxRouteAnalysis | undefined {
	if (
		!(
			isRecord(value) &&
			isWorkoutDifficulty(value.difficulty) &&
			isFiniteNumber(value.elevationGain) &&
			value.elevationGain >= 0 &&
			isFiniteNumber(value.maximumGrade) &&
			value.maximumGrade >= 0
		)
	) {
		return;
	}
	return {
		difficulty: value.difficulty,
		elevationGain: value.elevationGain,
		maximumGrade: value.maximumGrade,
	};
}

function routeSummary(value: unknown): BikeGpxRouteSummary | undefined {
	if (
		!(
			isRecord(value) &&
			isString(value.country) &&
			isFiniteNumber(value.distanceKm) &&
			value.distanceKm > 0 &&
			isString(value.id) &&
			NUMERIC_ROUTE_ID.test(value.id) &&
			isString(value.name) &&
			isString(value.summary)
		)
	) {
		return;
	}
	return {
		country: value.country,
		distanceKm: value.distanceKm,
		id: value.id,
		name: value.name,
		summary: value.summary,
	};
}

function routePoint(value: unknown): WorkoutRoutePoint | undefined {
	if (
		!(
			isRecord(value) &&
			isFiniteNumber(value.distance) &&
			isFiniteNumber(value.elevation) &&
			isFiniteNumber(value.latitude) &&
			isFiniteNumber(value.longitude) &&
			isFiniteNumber(value.x) &&
			isFiniteNumber(value.y)
		)
	) {
		return;
	}
	return {
		distance: value.distance,
		elevation: value.elevation,
		latitude: value.latitude,
		longitude: value.longitude,
		x: value.x,
		y: value.y,
	};
}

function routeCourse(value: unknown): WorkoutCourse | undefined {
	if (
		!(
			isRecord(value) &&
			isFiniteNumber(value.baseResistance) &&
			isString(value.description) &&
			isWorkoutDifficulty(value.difficulty) &&
			isFiniteNumber(value.distance) &&
			value.distance > 0 &&
			isFiniteNumber(value.elevationGain) &&
			value.elevationGain >= 0 &&
			isString(value.id) &&
			value.id.length > 0 &&
			isString(value.name) &&
			value.name.length > 0 &&
			Array.isArray(value.points) &&
			(value.routeType === 'loop' || value.routeType === 'point-to-point')
		)
	) {
		return;
	}
	const points = value.points.flatMap((point) => routePoint(point) ?? []);
	if (points.length !== value.points.length || points.length < 3) {
		return;
	}
	return {
		baseResistance: value.baseResistance,
		description: value.description,
		difficulty: value.difficulty,
		distance: value.distance,
		elevationGain: value.elevationGain,
		id: value.id,
		name: value.name,
		points,
		routeType: value.routeType,
	};
}

export function restoreBikeGpxCatalog(value: unknown): BikeGpxCatalog | undefined {
	if (!(isRecord(value) && isFiniteNumber(value.fetchedAt) && Array.isArray(value.routes))) {
		return;
	}
	const routes = value.routes.flatMap((route) => routeSummary(route) ?? []);
	if (routes.length !== value.routes.length || routes.length === 0) {
		return;
	}
	const routeIds = new Set(routes.map((route) => route.id));
	const analyses = isRecord(value.analyses)
		? Object.fromEntries(
				Object.entries(value.analyses).flatMap(([routeId, analysis]) => {
					const restored = routeIds.has(routeId) ? routeAnalysis(analysis) : undefined;
					return restored ? [[routeId, restored]] : [];
				})
			)
		: {};
	return { analyses, fetchedAt: value.fetchedAt, routes };
}

function restoreBikeGpxRouteResult(value: unknown): BikeGpxRouteResult | undefined {
	if (!isRecord(value)) {
		return;
	}
	const analysis = routeAnalysis(value.analysis);
	const course = routeCourse(value.course);
	return analysis && course ? { analysis, course } : undefined;
}

async function apiJson(path: string, signal?: AbortSignal): Promise<unknown> {
	const response = await fetch(`${API_ROOT}${path}`, { signal });
	const value: unknown = await response.json();
	if (!response.ok) {
		const message =
			isRecord(value) && isString(value.error) ? value.error : 'Backend request failed.';
		throw new Error(message);
	}
	return value;
}

export async function fetchBikeGpxCatalog(signal?: AbortSignal): Promise<BikeGpxCatalog> {
	const catalog = restoreBikeGpxCatalog(await apiJson('/bikegpx/routes', signal));
	if (!catalog) {
		throw new Error('The Ride Control backend returned an invalid BikeGPX catalog.');
	}
	return catalog;
}

export async function fetchBikeGpxRoute(
	route: BikeGpxRouteSummary,
	signal?: AbortSignal
): Promise<BikeGpxRouteResult> {
	const result = restoreBikeGpxRouteResult(
		await apiJson(`/bikegpx/routes/${encodeURIComponent(route.id)}`, signal)
	);
	if (!result) {
		throw new Error('The Ride Control backend returned an invalid BikeGPX route.');
	}
	return result;
}

export function bikeGpxRouteUrl(routeId: string): string {
	return `${BIKEGPX_ROUTES_URL}${routeId}`;
}
