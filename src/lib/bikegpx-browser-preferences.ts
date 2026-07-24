import { z } from 'zod';
import { type BikeGpxBrowserFormValues, bikeGpxBrowserFormSchema } from './bikegpx-browser-form';

const BIKEGPX_BROWSER_OPEN_STORAGE_KEY = 'ride-control-bikegpx-browser-open';
const BIKEGPX_BROWSER_OPEN_VALUE = 'open';
const BIKEGPX_BROWSER_SEARCH_STORAGE_KEY = 'ride-control-bikegpx-browser-search';

export interface BikeGpxBrowserSearch extends BikeGpxBrowserFormValues {
	selectedRouteId: string;
}

export type ReportedBikeGpxRouteId = string | null | undefined;

const bikeGpxBrowserSearchSchema = bikeGpxBrowserFormSchema.extend({
	selectedRouteId: z.string(),
});

const EMPTY_BIKEGPX_BROWSER_SEARCH: BikeGpxBrowserSearch = {
	country: '',
	maximumDistance: '',
	minimumDistance: '',
	query: '',
	selectedRouteId: '',
};

export function bikeGpxBrowserSearchForRoute(routeId: string): BikeGpxBrowserSearch {
	return { ...EMPTY_BIKEGPX_BROWSER_SEARCH, selectedRouteId: routeId };
}

export function initialBikeGpxBrowserSearch(
	requestedRouteId: string | undefined,
	storage?: Pick<Storage, 'getItem'>
): BikeGpxBrowserSearch {
	const saved = loadBikeGpxBrowserSearch(storage);
	return requestedRouteId && requestedRouteId !== saved.selectedRouteId
		? bikeGpxBrowserSearchForRoute(requestedRouteId)
		: saved;
}

export function bikeGpxBrowserSearchWithSelectedRoute(
	search: BikeGpxBrowserSearch,
	routeId: string
): BikeGpxBrowserSearch {
	return { ...search, selectedRouteId: routeId };
}

export function reconcileBikeGpxBrowserRoute(
	search: BikeGpxBrowserSearch,
	requestedRouteId: string | undefined,
	reportedRouteId: ReportedBikeGpxRouteId
): { reportedRouteId: ReportedBikeGpxRouteId; search: BikeGpxBrowserSearch } {
	if (reportedRouteId !== undefined) {
		const reportedRequest = reportedRouteId ?? undefined;
		if (requestedRouteId !== reportedRequest) {
			return { reportedRouteId, search };
		}
		return {
			reportedRouteId: undefined,
			search:
				requestedRouteId && requestedRouteId !== search.selectedRouteId
					? bikeGpxBrowserSearchWithSelectedRoute(search, requestedRouteId)
					: search,
		};
	}
	if (!(requestedRouteId && requestedRouteId !== search.selectedRouteId)) {
		return { reportedRouteId, search };
	}
	return {
		reportedRouteId,
		search: bikeGpxBrowserSearchForRoute(requestedRouteId),
	};
}

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
		const parsed = bikeGpxBrowserSearchSchema.safeParse(value);
		if (!parsed.success) {
			return EMPTY_BIKEGPX_BROWSER_SEARCH;
		}
		return parsed.data;
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
