import { APP_OVERLAY, type SideTrayOverlay } from './app-overlay';
import { unreachable } from './errors';

export const APP_ROUTE_KIND = {
	BIKEGPX: 'bikegpx',
	DEVICES: 'devices',
	HOME: 'home',
	SESSION: 'session',
	WORKOUT: 'workout',
} as const;

export type AppRoute =
	| { kind: typeof APP_ROUTE_KIND.BIKEGPX; routeId?: string }
	| { kind: typeof APP_ROUTE_KIND.DEVICES }
	| { kind: typeof APP_ROUTE_KIND.HOME }
	| { kind: typeof APP_ROUTE_KIND.SESSION; sessionId?: string }
	| { kind: typeof APP_ROUTE_KIND.WORKOUT; workoutId?: string };

export const HOME_APP_ROUTE: AppRoute = { kind: APP_ROUTE_KIND.HOME };

const APP_ROUTE_SEGMENT = {
	BIKEGPX: 'bikegpx',
	DEVICES: 'devices',
	SESSIONS: 'sessions',
	WORKOUTS: 'workouts',
} as const;

function decodedRouteId(segment: string | undefined): string | undefined {
	if (!segment) {
		return;
	}
	try {
		return decodeURIComponent(segment) || undefined;
	} catch {
		// Ignore malformed percent-encoding at the URL boundary.
	}
}

export function appRouteFromPathname(pathname: string): AppRoute {
	const segments = pathname.split('/').filter(Boolean);
	if (segments.length === 0) {
		return HOME_APP_ROUTE;
	}
	const [section, encodedId, ...extra] = segments;
	if (extra.length > 0) {
		return HOME_APP_ROUTE;
	}
	const id = decodedRouteId(encodedId);
	switch (section) {
		case APP_ROUTE_SEGMENT.BIKEGPX:
			return { kind: APP_ROUTE_KIND.BIKEGPX, routeId: id };
		case APP_ROUTE_SEGMENT.DEVICES:
			return id ? HOME_APP_ROUTE : { kind: APP_ROUTE_KIND.DEVICES };
		case APP_ROUTE_SEGMENT.SESSIONS:
			return { kind: APP_ROUTE_KIND.SESSION, sessionId: id };
		case APP_ROUTE_SEGMENT.WORKOUTS:
			return { kind: APP_ROUTE_KIND.WORKOUT, workoutId: id };
		default:
			return HOME_APP_ROUTE;
	}
}

function routePath(section: string, id?: string): string {
	return id ? `/${section}/${encodeURIComponent(id)}` : `/${section}`;
}

export function appRoutePath(route: AppRoute): string {
	switch (route.kind) {
		case APP_ROUTE_KIND.BIKEGPX:
			return routePath(APP_ROUTE_SEGMENT.BIKEGPX, route.routeId);
		case APP_ROUTE_KIND.DEVICES:
			return routePath(APP_ROUTE_SEGMENT.DEVICES);
		case APP_ROUTE_KIND.HOME:
			return '/';
		case APP_ROUTE_KIND.SESSION:
			return routePath(APP_ROUTE_SEGMENT.SESSIONS, route.sessionId);
		case APP_ROUTE_KIND.WORKOUT:
			return routePath(APP_ROUTE_SEGMENT.WORKOUTS, route.workoutId);
		default:
			return unreachable(route);
	}
}

export function appRouteSideTray(route: AppRoute): SideTrayOverlay | undefined {
	switch (route.kind) {
		case APP_ROUTE_KIND.BIKEGPX:
		case APP_ROUTE_KIND.WORKOUT:
			return APP_OVERLAY.WORKOUTS;
		case APP_ROUTE_KIND.DEVICES:
			return APP_OVERLAY.DEVICES;
		case APP_ROUTE_KIND.SESSION:
			return APP_OVERLAY.HISTORY;
		case APP_ROUTE_KIND.HOME:
			return;
		default:
			return unreachable(route);
	}
}
