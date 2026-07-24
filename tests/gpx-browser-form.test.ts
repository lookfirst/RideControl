import { describe, expect, test } from 'bun:test';
import { matchingGpxRoutes } from '../src/lib/gpx-browser-form';
import type { GpxRouteAnalysis, GpxRouteSummary } from '../src/lib/gpx-provider';

function route(id: string, group: string, distanceKm: number, name: string): GpxRouteSummary {
	return {
		collectionId: 'public-routes',
		distanceKm,
		group,
		id,
		location: name,
		name,
		providerId: 'bikegpx',
		sourceUrl: `https://example.com/${id}`,
		summary: name,
		tags: [group],
	};
}

const routes = [
	route('1', 'Austria', 101, 'Alpine climb'),
	route('2', 'Australia', 19, 'Coastal trail'),
	route('3', 'Canada', 9, 'River path'),
	route('4', 'Australia', 12, 'Unprepared route'),
];
const analyses: Record<string, GpxRouteAnalysis> = {
	'1': { difficulty: 'challenging', distance: 103, elevationGain: 1800, maximumGrade: 9 },
	'2': { difficulty: 'moderate', distance: 22, elevationGain: 240, maximumGrade: 5 },
	'3': { difficulty: 'gentle', distance: 10, elevationGain: 50, maximumGrade: 2 },
};
const emptyForm = {
	difficulty: undefined,
	group: '',
	maximumDistance: '',
	minimumDistance: '',
	query: '',
};

describe('GPX browser form', () => {
	test('filters by group and leaves all groups available when empty', () => {
		expect(matchingGpxRoutes(routes, emptyForm, 'kmh', analyses)).toEqual(routes);
		expect(
			matchingGpxRoutes(routes, { ...emptyForm, group: 'Australia' }, 'kmh', analyses)
		).toEqual([routes[1], routes[3]]);
	});

	test('combines prepared difficulty, displayed distance, and text filters', () => {
		expect(
			matchingGpxRoutes(
				routes,
				{
					...emptyForm,
					difficulty: 'moderate',
					group: 'Australia',
					maximumDistance: '30',
					minimumDistance: '20',
					query: 'coastal',
				},
				'kmh',
				analyses
			)
		).toEqual([routes[1]]);
		expect(
			matchingGpxRoutes(
				routes,
				{ ...emptyForm, maximumDistance: '14', minimumDistance: '13' },
				'mph',
				analyses
			)
		).toEqual([routes[1]]);
	});
});
