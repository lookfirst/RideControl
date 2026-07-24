import { describe, expect, test } from 'bun:test';
import {
	bikeGpxBrowserSearchForRoute,
	bikeGpxBrowserSearchWithSelectedRoute,
	initialBikeGpxBrowserSearch,
	loadBikeGpxBrowserOpen,
	loadBikeGpxBrowserSearch,
	persistBikeGpxBrowserOpen,
	persistBikeGpxBrowserSearch,
	reconcileBikeGpxBrowserRoute,
} from '../src/lib/bikegpx-browser-preferences';

describe('BikeGPX browser preferences', () => {
	test('creates an unfiltered search for a directly linked route', () => {
		expect(bikeGpxBrowserSearchForRoute('2635')).toEqual({
			country: '',
			maximumDistance: '',
			minimumDistance: '',
			query: '',
			selectedRouteId: '2635',
		});
	});

	test('restores filters when reloading their selected direct route', () => {
		const saved = {
			country: 'Australia',
			difficulty: 'challenging' as const,
			maximumDistance: '30',
			minimumDistance: '20',
			query: 'Barossa',
			selectedRouteId: '3543',
		};
		const storage = {
			getItem: () => JSON.stringify(saved),
		};
		expect(initialBikeGpxBrowserSearch('3543', storage)).toEqual(saved);
		expect(initialBikeGpxBrowserSearch('99', storage)).toEqual(
			bikeGpxBrowserSearchForRoute('99')
		);
	});

	test('preserves active filters when the visible result updates the direct link', () => {
		expect(
			bikeGpxBrowserSearchWithSelectedRoute(
				{
					country: 'Australia',
					maximumDistance: '30',
					minimumDistance: '10',
					query: 'trail',
					selectedRouteId: '',
				},
				'4513'
			)
		).toEqual({
			country: 'Australia',
			maximumDistance: '30',
			minimumDistance: '10',
			query: 'trail',
			selectedRouteId: '4513',
		});
	});

	test('preserves every filter while the router catches up with a cleared route', () => {
		const filteredSearch = {
			country: 'Australia',
			difficulty: 'moderate' as const,
			maximumDistance: '40',
			minimumDistance: '10',
			query: 'river trail',
			selectedRouteId: '',
		};
		const waitingForClear = reconcileBikeGpxBrowserRoute(filteredSearch, '99', null);
		expect(waitingForClear).toEqual({
			reportedRouteId: null,
			search: filteredSearch,
		});
		const cleared = reconcileBikeGpxBrowserRoute(filteredSearch, undefined, null);
		expect(cleared).toEqual({
			reportedRouteId: undefined,
			search: filteredSearch,
		});
		const waitingForSelection = reconcileBikeGpxBrowserRoute(filteredSearch, undefined, '4513');
		expect(waitingForSelection).toEqual({
			reportedRouteId: '4513',
			search: filteredSearch,
		});
		expect(reconcileBikeGpxBrowserRoute(filteredSearch, '4513', '4513')).toEqual({
			reportedRouteId: undefined,
			search: { ...filteredSearch, selectedRouteId: '4513' },
		});
	});

	test('clears filters only for an external direct route request', () => {
		expect(
			reconcileBikeGpxBrowserRoute(
				{
					country: 'Canada',
					difficulty: 'gentle',
					maximumDistance: '20',
					minimumDistance: '5',
					query: 'river',
					selectedRouteId: '3',
				},
				'99',
				undefined
			)
		).toEqual({
			reportedRouteId: undefined,
			search: {
				country: '',
				maximumDistance: '',
				minimumDistance: '',
				query: '',
				selectedRouteId: '99',
			},
		});
	});

	test('persists, restores, and clears the open browser', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => values.delete(key),
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadBikeGpxBrowserOpen(storage)).toBe(false);
		expect(persistBikeGpxBrowserOpen(true, storage)).toBe(true);
		expect(loadBikeGpxBrowserOpen(storage)).toBe(true);
		expect(persistBikeGpxBrowserOpen(false, storage)).toBe(true);
		expect(loadBikeGpxBrowserOpen(storage)).toBe(false);
	});

	test('persists and restores searches, filters, and the selected route', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};
		const search = {
			country: 'Canada',
			difficulty: 'moderate' as const,
			maximumDistance: '40',
			minimumDistance: '10',
			query: 'river trail',
			selectedRouteId: '99',
		};

		expect(persistBikeGpxBrowserSearch(search, storage)).toBe(true);
		expect(loadBikeGpxBrowserSearch(storage)).toEqual(search);
	});

	test('ignores invalid and unavailable storage', () => {
		const invalidStorage = { getItem: () => 'true' };
		expect(loadBikeGpxBrowserOpen(invalidStorage)).toBe(false);

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
		expect(loadBikeGpxBrowserOpen(unavailableStorage)).toBe(false);
		expect(persistBikeGpxBrowserOpen(true, unavailableStorage)).toBe(false);
		expect(loadBikeGpxBrowserSearch(unavailableStorage)).toEqual({
			country: '',
			maximumDistance: '',
			minimumDistance: '',
			query: '',
			selectedRouteId: '',
		});
		expect(persistBikeGpxBrowserSearch(loadBikeGpxBrowserSearch(), unavailableStorage)).toBe(
			false
		);
	});
});
