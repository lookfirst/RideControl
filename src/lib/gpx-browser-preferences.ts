import { z } from 'zod';
import { type GpxBrowserFormValues, gpxBrowserFormSchema } from './gpx-browser-form';

const GPX_BROWSER_OPEN_STORAGE_KEY = 'ride-control-gpx-browser-open';
const GPX_BROWSER_OPEN_VALUE = 'open';
const GPX_BROWSER_SEARCH_STORAGE_KEY = 'ride-control-gpx-browser-search';
const LEGACY_BIKEGPX_BROWSER_OPEN_STORAGE_KEY = 'ride-control-bikegpx-browser-open';
const LEGACY_BIKEGPX_BROWSER_SEARCH_STORAGE_KEY = 'ride-control-bikegpx-browser-search';
export const DEFAULT_GPX_PROVIDER_ID = 'bikegpx';
export const DEFAULT_GPX_COLLECTION_ID = 'public-routes';

export interface GpxBrowserSearch extends GpxBrowserFormValues {
	collectionId: string;
	providerId: string;
	selectedRouteId: string;
}

export type ReportedGpxRouteId = string | null | undefined;

const gpxBrowserSearchSchema = gpxBrowserFormSchema.extend({
	collectionId: z.string(),
	providerId: z.string(),
	selectedRouteId: z.string(),
});

const EMPTY_GPX_BROWSER_SEARCH: GpxBrowserSearch = {
	collectionId: DEFAULT_GPX_COLLECTION_ID,
	group: '',
	maximumDistance: '',
	minimumDistance: '',
	providerId: DEFAULT_GPX_PROVIDER_ID,
	query: '',
	selectedRouteId: '',
};

interface RequestedGpxRoute {
	collectionId?: string;
	providerId?: string;
	routeId?: string;
}

export function gpxBrowserSearchForRoute(request: RequestedGpxRoute): GpxBrowserSearch {
	return {
		...EMPTY_GPX_BROWSER_SEARCH,
		...(request.collectionId ? { collectionId: request.collectionId } : {}),
		...(request.providerId ? { providerId: request.providerId } : {}),
		selectedRouteId: request.routeId ?? '',
	};
}

export function initialGpxBrowserSearch(
	request: RequestedGpxRoute,
	storage?: Pick<Storage, 'getItem'>
): GpxBrowserSearch {
	const saved = loadGpxBrowserSearch(storage);
	const requestedCollection =
		request.collectionId &&
		(request.collectionId !== saved.collectionId || request.providerId !== saved.providerId);
	const requestedRoute = request.routeId && request.routeId !== saved.selectedRouteId;
	return requestedCollection || requestedRoute
		? gpxBrowserSearchForRoute({
				collectionId: request.collectionId ?? saved.collectionId,
				providerId: request.providerId ?? saved.providerId,
				routeId: request.routeId,
			})
		: saved;
}

export function gpxBrowserSearchWithSelectedRoute(
	search: GpxBrowserSearch,
	routeId: string
): GpxBrowserSearch {
	return { ...search, selectedRouteId: routeId };
}

export function reconcileGpxBrowserRoute(
	search: GpxBrowserSearch,
	requestedRouteId: string | undefined,
	reportedRouteId: ReportedGpxRouteId
): { reportedRouteId: ReportedGpxRouteId; search: GpxBrowserSearch } {
	if (reportedRouteId !== undefined) {
		const reportedRequest = reportedRouteId ?? undefined;
		if (requestedRouteId !== reportedRequest) {
			return { reportedRouteId, search };
		}
		return {
			reportedRouteId: undefined,
			search:
				requestedRouteId && requestedRouteId !== search.selectedRouteId
					? gpxBrowserSearchWithSelectedRoute(search, requestedRouteId)
					: search,
		};
	}
	if (!(requestedRouteId && requestedRouteId !== search.selectedRouteId)) {
		return { reportedRouteId, search };
	}
	return {
		reportedRouteId,
		search: gpxBrowserSearchForRoute({
			collectionId: search.collectionId,
			providerId: search.providerId,
			routeId: requestedRouteId,
		}),
	};
}

export function gpxRouteListScrollPositionStorageKey(
	providerId: string,
	collectionId: string
): string {
	return `ride-control-gpx-route-list-scroll-position:${providerId}:${collectionId}`;
}

export function loadGpxBrowserOpen(storage?: Pick<Storage, 'getItem'>): boolean {
	try {
		const browserStorage = storage ?? globalThis.localStorage;
		return Boolean(
			browserStorage.getItem(GPX_BROWSER_OPEN_STORAGE_KEY) === GPX_BROWSER_OPEN_VALUE ||
				browserStorage.getItem(LEGACY_BIKEGPX_BROWSER_OPEN_STORAGE_KEY) ===
					GPX_BROWSER_OPEN_VALUE
		);
	} catch {
		return false;
	}
}

export function persistGpxBrowserOpen(
	open: boolean,
	storage?: Pick<Storage, 'removeItem' | 'setItem'>
): boolean {
	try {
		const browserStorage = storage ?? globalThis.localStorage;
		if (open) {
			browserStorage.setItem(GPX_BROWSER_OPEN_STORAGE_KEY, GPX_BROWSER_OPEN_VALUE);
		} else {
			browserStorage.removeItem(GPX_BROWSER_OPEN_STORAGE_KEY);
			browserStorage.removeItem(LEGACY_BIKEGPX_BROWSER_OPEN_STORAGE_KEY);
		}
		return true;
	} catch {
		return false;
	}
}

function legacyBikeGpxSearch(value: unknown): GpxBrowserSearch | undefined {
	const parsed = z
		.object({
			country: z.string(),
			difficulty: gpxBrowserFormSchema.shape.difficulty,
			maximumDistance: z.string(),
			minimumDistance: z.string(),
			query: z.string(),
			selectedRouteId: z.string(),
		})
		.safeParse(value);
	return parsed.success
		? {
				...EMPTY_GPX_BROWSER_SEARCH,
				difficulty: parsed.data.difficulty,
				group: parsed.data.country,
				maximumDistance: parsed.data.maximumDistance,
				minimumDistance: parsed.data.minimumDistance,
				query: parsed.data.query,
				selectedRouteId: parsed.data.selectedRouteId,
			}
		: undefined;
}

export function loadGpxBrowserSearch(storage?: Pick<Storage, 'getItem'>): GpxBrowserSearch {
	try {
		const browserStorage = storage ?? globalThis.localStorage;
		const saved =
			browserStorage.getItem(GPX_BROWSER_SEARCH_STORAGE_KEY) ??
			browserStorage.getItem(LEGACY_BIKEGPX_BROWSER_SEARCH_STORAGE_KEY);
		const value: unknown = saved ? JSON.parse(saved) : undefined;
		const parsed = gpxBrowserSearchSchema.safeParse(value);
		if (parsed.success) {
			return parsed.data;
		}
		return legacyBikeGpxSearch(value) ?? EMPTY_GPX_BROWSER_SEARCH;
	} catch {
		return EMPTY_GPX_BROWSER_SEARCH;
	}
}

export function persistGpxBrowserSearch(
	search: GpxBrowserSearch,
	storage?: Pick<Storage, 'setItem'>
): boolean {
	try {
		(storage ?? globalThis.localStorage).setItem(
			GPX_BROWSER_SEARCH_STORAGE_KEY,
			JSON.stringify(search)
		);
		return true;
	} catch {
		return false;
	}
}
