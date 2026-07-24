import { describe, expect, test } from 'bun:test';
import type { BikeGpxRouteAnalysis, BikeGpxRouteSummary } from '../src/lib/bikegpx';
import { matchingBikeGpxRoutes } from '../src/lib/bikegpx-browser-form';

const routes: BikeGpxRouteSummary[] = [
	{
		country: 'Austria',
		distanceKm: 101,
		id: '1',
		name: 'Alpine climb',
		summary: 'Innsbruck → Brenner',
	},
	{
		country: 'Australia',
		distanceKm: 19,
		id: '2',
		name: 'Coastal trail',
		summary: 'Torquay → Bells Beach',
	},
	{
		country: 'Canada',
		distanceKm: 9,
		id: '3',
		name: 'River path',
		summary: 'Calgary → Inglewood',
	},
	{
		country: 'Australia',
		distanceKm: 12,
		id: '4',
		name: 'Unprepared route',
		summary: 'Sydney → Manly',
	},
];

const analyses: Record<string, BikeGpxRouteAnalysis> = {
	'1': { difficulty: 'challenging', distance: 103, elevationGain: 1800, maximumGrade: 9 },
	'2': { difficulty: 'moderate', distance: 22, elevationGain: 240, maximumGrade: 5 },
	'3': { difficulty: 'gentle', distance: 10, elevationGain: 50, maximumGrade: 2 },
};

const emptyForm = {
	country: '',
	difficulty: undefined,
	maximumDistance: '',
	minimumDistance: '',
	query: '',
};

describe('BikeGPX browser form', () => {
	test('filters by country and leaves all countries available when empty', () => {
		expect(matchingBikeGpxRoutes(routes, emptyForm, 'kmh', analyses)).toEqual(routes);
		expect(
			matchingBikeGpxRoutes(routes, { ...emptyForm, country: 'Australia' }, 'kmh', analyses)
		).toEqual([routes[1], routes[3]]);
	});

	test('filters prepared routes by difficulty', () => {
		expect(
			matchingBikeGpxRoutes(routes, { ...emptyForm, difficulty: 'moderate' }, 'kmh', analyses)
		).toEqual([routes[1]]);
	});

	test('filters prepared distance in either display unit', () => {
		expect(
			matchingBikeGpxRoutes(
				routes,
				{ ...emptyForm, maximumDistance: '25', minimumDistance: '20' },
				'kmh',
				analyses
			)
		).toEqual([routes[1]]);
		expect(
			matchingBikeGpxRoutes(
				routes,
				{ ...emptyForm, maximumDistance: '14', minimumDistance: '13' },
				'mph',
				analyses
			)
		).toEqual([routes[1]]);
	});

	test('combines text, country, difficulty, and distance filters', () => {
		expect(
			matchingBikeGpxRoutes(
				routes,
				{
					country: 'Australia',
					difficulty: 'moderate',
					maximumDistance: '30',
					minimumDistance: '20',
					query: 'coastal',
				},
				'kmh',
				analyses
			)
		).toEqual([routes[1]]);
		expect(
			matchingBikeGpxRoutes(routes, { ...emptyForm, query: 'river Canada' }, 'kmh', analyses)
		).toEqual([routes[2]]);
	});
});
