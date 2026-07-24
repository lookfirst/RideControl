import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
	fetchGpxCatalog,
	fetchGpxProviders,
	fetchGpxRoute,
	formatGpxRouteStats,
	type GpxCatalog,
	gpxPreviewRoute,
	gpxRouteAssetUrl,
	gpxRouteMatchesQuery,
	restoreGpxCatalog,
	restoreGpxProviders,
} from '../src/lib/gpx-provider';
import type { WorkoutCourse } from '../src/types';

const provider = {
	description: 'Public cycling routes.',
	id: 'bikegpx',
	name: 'BikeGPX',
	sourceUrl: 'https://bikegpx.com/bike_routes/',
};
const collection = {
	description: 'Routes grouped by country.',
	id: 'public-routes',
	name: 'Public routes',
	providerId: provider.id,
	sourceUrl: provider.sourceUrl,
};
const route = {
	collectionId: collection.id,
	distanceKm: 12,
	group: 'Aland Islands',
	id: '2635',
	location: 'Near Finström → Near Sund',
	name: 'Cykelbana Godby - Finby',
	providerId: provider.id,
	sourceUrl: 'https://bikegpx.com/bike_routes/2635',
	summary: 'Near Finström → Near Sund — 12 km',
	tags: ['Aland Islands'],
};
const catalog: GpxCatalog = {
	analyses: {
		'2635': {
			difficulty: 'moderate',
			distance: 12.4,
			elevationGain: 185,
			maximumGrade: 27.4,
		},
	},
	collection,
	fetchedAt: 1000,
	provider,
	routes: [route],
};
const course: WorkoutCourse = {
	description: 'Aland Islands · Near Finström → Near Sund',
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

describe('GPX provider backend client', () => {
	test('restores validated providers and catalogs', () => {
		const providers = [{ ...provider, collections: [{ ...collection, routeCount: 1 }] }];
		expect(restoreGpxProviders(providers)).toEqual(providers);
		expect(restoreGpxCatalog(catalog)).toEqual(catalog);
		expect(restoreGpxCatalog({ ...catalog, analyses: {} })).toBeUndefined();
		expect(
			restoreGpxCatalog({ ...catalog, collection: { ...collection, providerId: 'other' } })
		).toBeUndefined();
	});

	test('searches generic route metadata and distances in both unit systems', () => {
		expect(gpxRouteMatchesQuery(route, '12 km')).toBeTrue();
		expect(gpxRouteMatchesQuery(route, '7.5 mi')).toBeTrue();
		expect(
			gpxRouteMatchesQuery(route, 'finström moderate', catalog.analyses[route.id])
		).toBeTrue();
		expect(gpxRouteMatchesQuery(route, '50 km')).toBeFalse();
	});

	test('previews a selected prepared route or the first prepared route', () => {
		const otherRoute = { ...route, id: '4513', name: 'Other prepared route' };
		expect(gpxPreviewRoute([otherRoute, route], '')).toEqual(otherRoute);
		expect(gpxPreviewRoute([otherRoute, route], route.id)).toEqual(route);
	});

	test('formats finalized route stats without repeating distance', () => {
		expect(formatGpxRouteStats(route, catalog.analyses[route.id], 'mph')).toBe(
			'7.7 mi · 607 ft climbing · Up to +27.4%'
		);
		expect(formatGpxRouteStats(route, undefined, 'mph')).toBe('7.5 mi');
		expect(gpxRouteAssetUrl(route, 'gpx')).toBe(
			'/api/gpx/providers/bikegpx/collections/public-routes/routes/2635/gpx'
		);
	});

	test('loads provider and collection catalogs from the generic REST API', async () => {
		const providers = [{ ...provider, collections: [{ ...collection, routeCount: 1 }] }];
		const fetchMock = mock(async (url: string) =>
			Response.json(url.endsWith('/providers') ? providers : catalog)
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		expect(await fetchGpxProviders()).toEqual(providers);
		expect(await fetchGpxCatalog(provider.id, collection.id)).toEqual(catalog);
		expect(fetchMock).toHaveBeenCalledWith('/api/gpx/providers', {
			cache: 'no-cache',
			signal: undefined,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/gpx/providers/bikegpx/collections/public-routes/routes',
			{ cache: 'no-cache', signal: undefined }
		);
	});

	test('loads an already prepared route and surfaces backend errors', async () => {
		const result = { analysis: catalog.analyses[route.id], course };
		const fetchMock = mock(async () => Response.json(result));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		expect(await fetchGpxRoute(route)).toEqual(result);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/gpx/providers/bikegpx/collections/public-routes/routes/2635?prepared-route-version=5',
			{ cache: undefined, signal: undefined }
		);

		globalThis.fetch = mock(async () =>
			Response.json({ error: 'Prepared route not found.' }, { status: 404 })
		) as unknown as typeof fetch;
		await expect(fetchGpxRoute(route)).rejects.toThrow('Prepared route not found.');
	});
});
