import { isRecord, isString } from './type-guards';
import { isWorkoutDifficulty, type WorkoutDifficulty } from './workout-schema';

const BIKEGPX_BROWSER_OPEN_STORAGE_KEY = 'ride-control-bikegpx-browser-open';
const BIKEGPX_BROWSER_OPEN_VALUE = 'open';
const BIKEGPX_BROWSER_SEARCH_STORAGE_KEY = 'ride-control-bikegpx-browser-search';

export interface BikeGpxBrowserSearch {
	country: string;
	difficulty?: WorkoutDifficulty;
	maximumDistance: string;
	minimumDistance: string;
	query: string;
	selectedRouteId: string;
}

const EMPTY_BIKEGPX_BROWSER_SEARCH: BikeGpxBrowserSearch = {
	country: '',
	maximumDistance: '',
	minimumDistance: '',
	query: '',
	selectedRouteId: '',
};

export const BIKEGPX_ROUTE_LIST_SCROLL_POSITION_STORAGE_KEY =
	'ride-control-bikegpx-route-list-scroll-position';

export function loadBikeGpxBrowserOpen(storage?: Pick<Storage, 'getItem'>): boolean {
	try {
		return (
			(storage ?? globalThis.localStorage).getItem(BIKEGPX_BROWSER_OPEN_STORAGE_KEY) ===
			BIKEGPX_BROWSER_OPEN_VALUE
		);
	} catch {
		return false;
	}
}

export function persistBikeGpxBrowserOpen(
	open: boolean,
	storage?: Pick<Storage, 'removeItem' | 'setItem'>
): boolean {
	try {
		const browserStorage = storage ?? globalThis.localStorage;
		if (open) {
			browserStorage.setItem(BIKEGPX_BROWSER_OPEN_STORAGE_KEY, BIKEGPX_BROWSER_OPEN_VALUE);
		} else {
			browserStorage.removeItem(BIKEGPX_BROWSER_OPEN_STORAGE_KEY);
		}
		return true;
	} catch {
		return false;
	}
}

export function loadBikeGpxBrowserSearch(storage?: Pick<Storage, 'getItem'>): BikeGpxBrowserSearch {
	try {
		const saved = (storage ?? globalThis.localStorage).getItem(
			BIKEGPX_BROWSER_SEARCH_STORAGE_KEY
		);
		const value: unknown = saved ? JSON.parse(saved) : undefined;
		if (
			!(
				isRecord(value) &&
				isString(value.country) &&
				(value.difficulty === undefined || isWorkoutDifficulty(value.difficulty)) &&
				isString(value.maximumDistance) &&
				isString(value.minimumDistance) &&
				isString(value.query) &&
				isString(value.selectedRouteId)
			)
		) {
			return EMPTY_BIKEGPX_BROWSER_SEARCH;
		}
		return {
			country: value.country,
			difficulty: value.difficulty,
			maximumDistance: value.maximumDistance,
			minimumDistance: value.minimumDistance,
			query: value.query,
			selectedRouteId: value.selectedRouteId,
		};
	} catch {
		return EMPTY_BIKEGPX_BROWSER_SEARCH;
	}
}

export function persistBikeGpxBrowserSearch(
	search: BikeGpxBrowserSearch,
	storage?: Pick<Storage, 'setItem'>
): boolean {
	try {
		(storage ?? globalThis.localStorage).setItem(
			BIKEGPX_BROWSER_SEARCH_STORAGE_KEY,
			JSON.stringify(search)
		);
		return true;
	} catch {
		return false;
	}
}
