import type { SpeedUnit, WorkoutCourse, WorkoutRoutePoint } from '../types';
import { isFiniteNumber, isRecord, isString } from './type-guards';
import {
	descriptionWithoutDistance,
	formatDistance,
	formatElevation,
	KILOMETERS_PER_MILE,
} from './units';
import { isWorkoutDifficulty, type WorkoutDifficulty } from './workout-schema';

export const BIKEGPX_ROUTES_URL = 'https://bikegpx.com/bike_routes/';
const SEARCH_WHITESPACE = /\s+/u;
const NUMERIC_ROUTE_ID = /^\d+$/;
const PREPARED_ROUTE_VERSION = 4;
const CONFIGURED_API_ROOT = import.meta.env.VITE_RIDECONTROL_API_URL || '/api';
const API_ROOT = CONFIGURED_API_ROOT.replace(/\/$/u, '');

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
	distance: number;
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

export function bikeGpxPreviewRoute(
	routes: BikeGpxRouteSummary[],
	selectedRouteId: string
): BikeGpxRouteSummary | undefined {
	const selectedRoute = routes.find((route) => route.id === selectedRouteId);
	return selectedRoute ?? routes[0];
}

export function bikeGpxRouteLocation(route: BikeGpxRouteSummary): string {
	return descriptionWithoutDistance(route.summary);
}

export function formatBikeGpxRouteStats(
	route: BikeGpxRouteSummary,
	analysis: BikeGpxRouteAnalysis | undefined,
	unit: SpeedUnit
): string {
	const distance = analysis ? analysis.distance : route.distanceKm;
	const stats = [formatDistance(distance, unit, 1)];
	if (analysis) {
		stats.push(
			`${formatElevation(analysis.elevationGain, unit)} climbing`,
			`Up to +${analysis.maximumGrade.toFixed(1)}%`
		);
	}
	return stats.join(' · ');
}

function routeAnalysis(value: unknown): BikeGpxRouteAnalysis | undefined {
	if (
		!(
			isRecord(value) &&
			isWorkoutDifficulty(value.difficulty) &&
			isFiniteNumber(value.distance) &&
			value.distance > 0 &&
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
		distance: value.distance,
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
	if (
		!(
			isRecord(value) &&
			isRecord(value.analyses) &&
			isFiniteNumber(value.fetchedAt) &&
			Array.isArray(value.routes)
		)
	) {
		return;
	}
	const routes = value.routes.flatMap((route) => routeSummary(route) ?? []);
	if (routes.length !== value.routes.length) {
		return;
	}
	const routeIds = new Set(routes.map((route) => route.id));
	const analyses = Object.fromEntries(
		Object.entries(value.analyses).flatMap(([routeId, analysis]) => {
			const restored = routeIds.has(routeId) ? routeAnalysis(analysis) : undefined;
			return restored ? [[routeId, restored]] : [];
		})
	);
	if (routes.some((route) => !analyses[route.id])) {
		return;
	}
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

async function apiResponse(
	path: string,
	signal?: AbortSignal,
	cache?: RequestCache
): Promise<{ response: Response; value: unknown }> {
	const response = await fetch(`${API_ROOT}${path}`, { cache, signal });
	const value: unknown = await response.json();
	return { response, value };
}

function backendError(value: unknown): Error {
	const message =
		isRecord(value) && isString(value.error) ? value.error : 'Backend request failed.';
	return new Error(message);
}

async function apiJson(path: string, signal?: AbortSignal, cache?: RequestCache): Promise<unknown> {
	const { response, value } = await apiResponse(path, signal, cache);
	if (!response.ok) {
		throw backendError(value);
	}
	return value;
}

export async function fetchBikeGpxCatalog(signal?: AbortSignal): Promise<BikeGpxCatalog> {
	const catalog = restoreBikeGpxCatalog(await apiJson('/bikegpx/routes', signal, 'no-cache'));
	if (!catalog) {
		throw new Error('The Ride Control backend returned an invalid BikeGPX catalog.');
	}
	return catalog;
}

export async function fetchBikeGpxRoute(
	route: BikeGpxRouteSummary,
	signal?: AbortSignal
): Promise<BikeGpxRouteResult> {
	const path = `/bikegpx/routes/${encodeURIComponent(route.id)}?prepared-route-version=${PREPARED_ROUTE_VERSION}`;
	const result = restoreBikeGpxRouteResult(await apiJson(path, signal));
	if (!result) {
		throw new Error('The Ride Control backend returned an invalid BikeGPX route.');
	}
	return result;
}

export function bikeGpxRouteUrl(routeId: string): string {
	return `${BIKEGPX_ROUTES_URL}${routeId}`;
}
