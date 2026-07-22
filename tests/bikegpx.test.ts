import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
	type BikeGpxCatalog,
	bikeGpxPreviewRoute,
	bikeGpxRouteLocation,
	bikeGpxRouteMatchesQuery,
	bikeGpxRouteUrl,
	fetchBikeGpxCatalog,
	fetchBikeGpxRoute,
	formatBikeGpxRouteStats,
	restoreBikeGpxCatalog,
} from '../src/lib/bikegpx';
import type { WorkoutCourse } from '../src/types';

const route = {
	country: 'Aland Islands',
	distanceKm: 12,
	id: '2635',
	name: 'Cykelbana Godby - Finby',
	summary: 'Near Finström → Near Sund — 12 km',
};

const catalog: BikeGpxCatalog = {
	analyses: {
		'2635': { difficulty: 'moderate', distance: 12.4, elevationGain: 185, maximumGrade: 27.4 },
	},
	fetchedAt: 1000,
	routes: [route],
};

const course: WorkoutCourse = {
	baseResistance: 12,
	description: 'Aland Islands · Near Finström → Near Sund — 12 km',
	difficulty: 'moderate',
	distance: 0.25,
	elevationGain: 10,
	id: 'gpx-12345678',
	name: route.name,
	points: [
		{ distance: 0, elevation: 11.4, latitude: 60.230_04, longitude: 19.987_38, x: 8, y: 92 },
		{
			distance: 0.125,
			elevation: 21.4,
			latitude: 60.231_04,
			longitude: 19.988_38,
			x: 50,
			y: 50,
		},
		{
			distance: 0.25,
			elevation: 16.4,
			latitude: 60.232_04,
			longitude: 19.989_38,
			x: 92,
			y: 8,
		},
	],
	routeType: 'point-to-point',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('BikeGPX backend client', () => {
	test('restores a validated backend catalog', () => {
		expect(restoreBikeGpxCatalog(catalog)).toEqual(catalog);
		expect(restoreBikeGpxCatalog({ ...catalog, analyses: {} })).toBe(undefined);
		expect(restoreBikeGpxCatalog({ analyses: {}, fetchedAt: 1000, routes: [] })).toEqual({
			analyses: {},
			fetchedAt: 1000,
			routes: [],
		});
		expect(
			restoreBikeGpxCatalog({ ...catalog, routes: [{ ...route, id: 'not-numeric' }] })
		).toBe(undefined);
	});

	test('searches route distances in metric and imperial units', () => {
		expect(bikeGpxRouteMatchesQuery(route, '12 km')).toBeTrue();
		expect(bikeGpxRouteMatchesQuery(route, '12km')).toBeTrue();
		expect(bikeGpxRouteMatchesQuery(route, '7.5 mi')).toBeTrue();
		expect(bikeGpxRouteMatchesQuery(route, 'moderate', catalog.analyses[route.id])).toBeTrue();
		expect(bikeGpxRouteMatchesQuery(route, '50 km')).toBeFalse();
		expect(bikeGpxRouteUrl(route.id)).toBe('https://bikegpx.com/bike_routes/2635');
	});

	test('previews a remembered prepared route or the first prepared route', () => {
		const otherRoute = { ...route, id: '4513', name: 'Other prepared route' };
		expect(bikeGpxPreviewRoute([otherRoute, route], '')).toEqual(otherRoute);
		expect(bikeGpxPreviewRoute([otherRoute, route], route.id)).toEqual(route);
	});

	test('formats route location and finalized stats without repeating distance', () => {
		expect(bikeGpxRouteLocation(route)).toBe('Near Finström → Near Sund');
		expect(formatBikeGpxRouteStats(route, catalog.analyses[route.id], 'mph')).toBe(
			'7.7 mi · 607 ft climbing · Up to +27.4%'
		);
		expect(formatBikeGpxRouteStats(route, undefined, 'mph')).toBe('7.5 mi');
	});

	test('loads the catalog from the Ride Control backend API', async () => {
		const fetchMock = mock(async () => Response.json(catalog));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		expect(await fetchBikeGpxCatalog()).toEqual(catalog);
		expect(fetchMock).toHaveBeenCalledWith('/api/bikegpx/routes', {
			cache: 'no-cache',
			signal: undefined,
		});
	});

	test('loads an already processed route and analysis from the backend API', async () => {
		const result = {
			analysis: catalog.analyses[route.id],
			course,
		};
		const fetchMock = mock(async () => Response.json(result));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		expect(await fetchBikeGpxRoute(route)).toEqual(result);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/bikegpx/routes/2635?prepared-route-version=4',
			{ cache: undefined, signal: undefined }
		);
	});

	test('rejects an unprepared route response instead of polling it', async () => {
		const fetchMock = mock(async () =>
			Response.json({ error: 'BikeGPX route not found.' }, { status: 404 })
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		await expect(fetchBikeGpxRoute(route)).rejects.toThrow('BikeGPX route not found.');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('surfaces backend errors', async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ error: 'BikeGPX is unavailable.' }, { status: 502 })
		) as unknown as typeof fetch;
		await expect(fetchBikeGpxCatalog()).rejects.toThrow('BikeGPX is unavailable.');
	});
});
