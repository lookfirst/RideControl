import { describe, expect, test } from 'bun:test';
import {
	gpxBrowserSearchForRoute,
	gpxBrowserSearchWithSelectedRoute,
	gpxRouteListScrollPositionStorageKey,
	initialGpxBrowserSearch,
	loadGpxBrowserOpen,
	loadGpxBrowserSearch,
	persistGpxBrowserOpen,
	persistGpxBrowserSearch,
	reconcileGpxBrowserRoute,
} from '../src/lib/gpx-browser-preferences';

const directRoute = {
	collectionId: 'tour-de-france-2026',
	providerId: 'cyclingstage',
	routeId: '7',
};

describe('GPX browser preferences', () => {
	test('creates an unfiltered search for a provider route', () => {
		expect(gpxBrowserSearchForRoute(directRoute)).toEqual({
			collectionId: directRoute.collectionId,
			group: '',
			maximumDistance: '',
			minimumDistance: '',
			providerId: directRoute.providerId,
			query: '',
			selectedRouteId: directRoute.routeId,
		});
	});

	test('restores filters for the same route and resets them for an external route', () => {
		const saved = {
			collectionId: directRoute.collectionId,
			difficulty: 'challenging' as const,
			group: 'Tour de France 2026',
			maximumDistance: '230',
			minimumDistance: '100',
			providerId: directRoute.providerId,
			query: 'stage',
			selectedRouteId: directRoute.routeId,
		};
		const storage = { getItem: () => JSON.stringify(saved) };
		expect(initialGpxBrowserSearch(directRoute, storage)).toEqual(saved);
		expect(initialGpxBrowserSearch({ ...directRoute, routeId: '8' }, storage)).toEqual(
			gpxBrowserSearchForRoute({ ...directRoute, routeId: '8' })
		);
	});

	test('preserves filters while selection and the router catch up', () => {
		const search = {
			collectionId: 'public-routes',
			group: 'Australia',
			maximumDistance: '30',
			minimumDistance: '10',
			providerId: 'bikegpx',
			query: 'trail',
			selectedRouteId: '',
		};
		expect(gpxBrowserSearchWithSelectedRoute(search, '4513')).toEqual({
			...search,
			selectedRouteId: '4513',
		});
		expect(reconcileGpxBrowserRoute(search, '99', null)).toEqual({
			reportedRouteId: null,
			search,
		});
		expect(reconcileGpxBrowserRoute(search, undefined, '4513')).toEqual({
			reportedRouteId: '4513',
			search,
		});
		expect(reconcileGpxBrowserRoute(search, '4513', '4513')).toEqual({
			reportedRouteId: undefined,
			search: { ...search, selectedRouteId: '4513' },
		});
	});

	test('persists browser state and scopes scroll positions by collection', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => values.delete(key),
			setItem: (key: string, value: string) => values.set(key, value),
		};
		const search = gpxBrowserSearchForRoute(directRoute);
		expect(persistGpxBrowserOpen(true, storage)).toBeTrue();
		expect(loadGpxBrowserOpen(storage)).toBeTrue();
		expect(persistGpxBrowserSearch(search, storage)).toBeTrue();
		expect(loadGpxBrowserSearch(storage)).toEqual(search);
		expect(
			gpxRouteListScrollPositionStorageKey(directRoute.providerId, directRoute.collectionId)
		).toBe('ride-control-gpx-route-list-scroll-position:cyclingstage:tour-de-france-2026');
		expect(persistGpxBrowserOpen(false, storage)).toBeTrue();
		expect(loadGpxBrowserOpen(storage)).toBeFalse();
	});

	test('migrates the prior BikeGPX search shape into the default collection', () => {
		const storage = {
			getItem: (key: string) =>
				key === 'ride-control-bikegpx-browser-search'
					? JSON.stringify({
							country: 'Canada',
							maximumDistance: '40',
							minimumDistance: '10',
							query: 'river',
							selectedRouteId: '99',
						})
					: null,
		};
		expect(loadGpxBrowserSearch(storage)).toEqual({
			collectionId: 'public-routes',
			group: 'Canada',
			maximumDistance: '40',
			minimumDistance: '10',
			providerId: 'bikegpx',
			query: 'river',
			selectedRouteId: '99',
		});
	});

	test('uses safe defaults when storage is unavailable', () => {
		const unavailableStorage = {
			getItem: () => {
				throw new Error('Unavailable');
			},
			removeItem: () => {
				throw new Error('Unavailable');
			},
			setItem: () => {
				throw new Error('Unavailable');
			},
		};
		expect(loadGpxBrowserOpen(unavailableStorage)).toBeFalse();
		expect(loadGpxBrowserSearch(unavailableStorage)).toEqual({
			collectionId: 'public-routes',
			group: '',
			maximumDistance: '',
			minimumDistance: '',
			providerId: 'bikegpx',
			query: '',
			selectedRouteId: '',
		});
		expect(persistGpxBrowserSearch(loadGpxBrowserSearch(), unavailableStorage)).toBeFalse();
	});
});
