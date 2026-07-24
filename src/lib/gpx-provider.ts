import type { SpeedUnit, WorkoutCourse, WorkoutRoutePoint } from '../types';
import { isFiniteNumber, isRecord, isString } from './type-guards';
import { formatDistance, formatElevation, KILOMETERS_PER_MILE } from './units';
import { isWorkoutDifficulty, type WorkoutDifficulty } from './workout-schema';

const SEARCH_WHITESPACE = /\s+/u;
const PREPARED_ROUTE_VERSION = 5;
const CONFIGURED_API_ROOT = import.meta.env.VITE_RIDECONTROL_API_URL || '/api';
const API_ROOT = CONFIGURED_API_ROOT.replace(/\/$/u, '');

export interface GpxRouteImage {
	alt: string;
	attribution?: string;
	url: string;
}

export interface GpxRouteSummary {
	collectionId: string;
	distanceKm: number;
	group: string;
	id: string;
	image?: GpxRouteImage;
	location: string;
	name: string;
	providerId: string;
	sequence?: number;
	sourceUrl: string;
	summary: string;
	tags: string[];
}

export interface GpxRouteAnalysis {
	difficulty: WorkoutDifficulty;
	distance: number;
	elevationGain: number;
	maximumGrade: number;
}

export interface GpxProvider {
	description: string;
	id: string;
	name: string;
	sourceUrl: string;
}

export interface GpxCollection {
	description: string;
	id: string;
	name: string;
	providerId: string;
	sourceUrl: string;
	year?: number;
}

export interface GpxProviderCollection extends GpxCollection {
	routeCount: number;
}

export interface GpxProviderCatalog extends GpxProvider {
	collections: GpxProviderCollection[];
}

export interface GpxCatalog {
	analyses: Record<string, GpxRouteAnalysis>;
	collection: GpxCollection;
	fetchedAt: number;
	provider: GpxProvider;
	routes: GpxRouteSummary[];
}

export interface GpxRouteResult {
	analysis: GpxRouteAnalysis;
	course: WorkoutCourse;
}

export function gpxRouteKey(route: Pick<GpxRouteSummary, 'collectionId' | 'id' | 'providerId'>) {
	return `${route.providerId}/${route.collectionId}/${route.id}`;
}

export function gpxRouteAssetUrl(
	route: Pick<GpxRouteSummary, 'collectionId' | 'id' | 'providerId'>,
	asset: 'gpx' | 'image'
): string {
	const path = `/gpx/providers/${encodeURIComponent(route.providerId)}/collections/${encodeURIComponent(route.collectionId)}/routes/${encodeURIComponent(route.id)}/${asset}`;
	return `${API_ROOT}${path}`;
}

export function gpxRouteMatchesQuery(
	route: GpxRouteSummary,
	query: string,
	analysis?: GpxRouteAnalysis
): boolean {
	const terms = query.trim().toLocaleLowerCase().split(SEARCH_WHITESPACE).filter(Boolean);
	if (terms.length === 0) {
		return true;
	}
	const miles = route.distanceKm / KILOMETERS_PER_MILE;
	const difficulty = analysis?.difficulty ?? 'uncategorized';
	const searchable =
		`${route.name} ${route.group} ${route.location} ${route.summary} ${route.tags.join(' ')} ${difficulty} ${route.distanceKm.toFixed(1)} ${route.distanceKm.toFixed(0)} ${route.distanceKm.toFixed(1)}km ${route.distanceKm.toFixed(0)}km km kilometer kilometers ${miles.toFixed(1)} ${miles.toFixed(0)} ${miles.toFixed(1)}mi ${miles.toFixed(0)}mi mi mile miles`.toLocaleLowerCase();
	return terms.every((term) => searchable.includes(term));
}

export function gpxPreviewRoute(
	routes: GpxRouteSummary[],
	selectedRouteId: string
): GpxRouteSummary | undefined {
	const selectedRoute = routes.find((route) => route.id === selectedRouteId);
	return selectedRoute ?? routes[0];
}

export function formatGpxRouteStats(
	route: GpxRouteSummary,
	analysis: GpxRouteAnalysis | undefined,
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

function routeAnalysis(value: unknown): GpxRouteAnalysis | undefined {
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

function apiAssetUrl(value: string): string {
	if (!value.startsWith('/')) {
		return value;
	}
	if (!API_ROOT.startsWith('http')) {
		return value;
	}
	return new URL(value, API_ROOT).href;
}

function routeImage(value: unknown): GpxRouteImage | undefined {
	if (!(isRecord(value) && isString(value.alt) && isString(value.url))) {
		return;
	}
	return {
		alt: value.alt,
		...(isString(value.attribution) ? { attribution: value.attribution } : {}),
		url: apiAssetUrl(value.url),
	};
}

function stringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value) || value.some((item) => !isString(item))) {
		return;
	}
	return value;
}

function routeSummary(value: unknown): GpxRouteSummary | undefined {
	if (
		!(
			isRecord(value) &&
			isString(value.collectionId) &&
			isFiniteNumber(value.distanceKm) &&
			value.distanceKm > 0 &&
			isString(value.group) &&
			isString(value.id) &&
			isString(value.location) &&
			isString(value.name) &&
			isString(value.providerId) &&
			isString(value.sourceUrl) &&
			isString(value.summary)
		)
	) {
		return;
	}
	const tags = stringArray(value.tags);
	const image = value.image === undefined ? undefined : routeImage(value.image);
	if (!(tags && (value.image === undefined || image))) {
		return;
	}
	return {
		collectionId: value.collectionId,
		distanceKm: value.distanceKm,
		group: value.group,
		id: value.id,
		...(image ? { image } : {}),
		location: value.location,
		name: value.name,
		providerId: value.providerId,
		...(isFiniteNumber(value.sequence) ? { sequence: value.sequence } : {}),
		sourceUrl: value.sourceUrl,
		summary: value.summary,
		tags,
	};
}

function provider(value: unknown): GpxProvider | undefined {
	if (
		!(
			isRecord(value) &&
			isString(value.description) &&
			isString(value.id) &&
			isString(value.name) &&
			isString(value.sourceUrl)
		)
	) {
		return;
	}
	return {
		description: value.description,
		id: value.id,
		name: value.name,
		sourceUrl: value.sourceUrl,
	};
}

function collection(value: unknown): GpxCollection | undefined {
	if (
		!(
			isRecord(value) &&
			isString(value.description) &&
			isString(value.id) &&
			isString(value.name) &&
			isString(value.providerId) &&
			isString(value.sourceUrl)
		)
	) {
		return;
	}
	return {
		description: value.description,
		id: value.id,
		name: value.name,
		providerId: value.providerId,
		sourceUrl: value.sourceUrl,
		...(isFiniteNumber(value.year) ? { year: value.year } : {}),
	};
}

function providerCollection(value: unknown): GpxProviderCollection | undefined {
	const restored = collection(value);
	return restored && isRecord(value) && isFiniteNumber(value.routeCount) && value.routeCount >= 0
		? { ...restored, routeCount: value.routeCount }
		: undefined;
}

export function restoreGpxProviders(value: unknown): GpxProviderCatalog[] | undefined {
	if (!Array.isArray(value)) {
		return;
	}
	const providers = value.flatMap((candidate) => {
		const restored = provider(candidate);
		if (!(restored && isRecord(candidate) && Array.isArray(candidate.collections))) {
			return [];
		}
		const collections = candidate.collections.flatMap((item) => providerCollection(item) ?? []);
		return collections.length === candidate.collections.length
			? [{ ...restored, collections }]
			: [];
	});
	return providers.length === value.length ? providers : undefined;
}

export function restoreGpxCatalog(value: unknown): GpxCatalog | undefined {
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
	const restoredProvider = provider(value.provider);
	const restoredCollection = collection(value.collection);
	const routes = value.routes.flatMap((route) => routeSummary(route) ?? []);
	if (
		!(
			restoredProvider &&
			restoredCollection &&
			routes.length === value.routes.length &&
			restoredCollection.providerId === restoredProvider.id
		)
	) {
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
	return {
		analyses,
		collection: restoredCollection,
		fetchedAt: value.fetchedAt,
		provider: restoredProvider,
		routes,
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

function restoreGpxRouteResult(value: unknown): GpxRouteResult | undefined {
	if (!isRecord(value)) {
		return;
	}
	const analysis = routeAnalysis(value.analysis);
	const course = routeCourse(value.course);
	return analysis && course ? { analysis, course } : undefined;
}

async function apiJson(path: string, signal?: AbortSignal, cache?: RequestCache): Promise<unknown> {
	const response = await fetch(`${API_ROOT}${path}`, { cache, signal });
	const value: unknown = await response.json();
	if (!response.ok) {
		const message =
			isRecord(value) && isString(value.error) ? value.error : 'Backend request failed.';
		throw new Error(message);
	}
	return value;
}

export async function fetchGpxProviders(signal?: AbortSignal): Promise<GpxProviderCatalog[]> {
	const providers = restoreGpxProviders(await apiJson('/gpx/providers', signal, 'no-cache'));
	if (!providers) {
		throw new Error('The Ride Control backend returned invalid GPX providers.');
	}
	return providers;
}

export async function fetchGpxCatalog(
	providerId: string,
	collectionId: string,
	signal?: AbortSignal
): Promise<GpxCatalog> {
	const path = `/gpx/providers/${encodeURIComponent(providerId)}/collections/${encodeURIComponent(collectionId)}/routes`;
	const catalog = restoreGpxCatalog(await apiJson(path, signal, 'no-cache'));
	if (!catalog) {
		throw new Error('The Ride Control backend returned an invalid GPX catalog.');
	}
	return catalog;
}

export async function fetchGpxRoute(
	route: GpxRouteSummary,
	signal?: AbortSignal
): Promise<GpxRouteResult> {
	const path = `/gpx/providers/${encodeURIComponent(route.providerId)}/collections/${encodeURIComponent(route.collectionId)}/routes/${encodeURIComponent(route.id)}?prepared-route-version=${PREPARED_ROUTE_VERSION}`;
	const result = restoreGpxRouteResult(await apiJson(path, signal));
	if (!result) {
		throw new Error('The Ride Control backend returned an invalid GPX route.');
	}
	return result;
}
