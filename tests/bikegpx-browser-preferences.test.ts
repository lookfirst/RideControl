import { describe, expect, test } from 'bun:test';
import {
	loadBikeGpxBrowserOpen,
	loadBikeGpxBrowserSearch,
	persistBikeGpxBrowserOpen,
	persistBikeGpxBrowserSearch,
} from '../src/lib/bikegpx-browser-preferences';

describe('BikeGPX browser preferences', () => {
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
