import { APP_OVERLAY, type SideTrayOverlay } from './app-overlay';
import { unreachable } from './errors';
import { type ProfileTab, profileTabSchema } from './profile-tab';
import { sessionCalendarMonthKeySchema } from './session-calendar';
import { type SessionHistoryView, sessionHistoryViewSchema } from './session-history-view';

export const APP_ROUTE_PATH = {
	BIKEGPX_LEGACY: '/bikegpx',
	BIKEGPX_ROUTE_LEGACY: '/bikegpx/$routeId',
	DEVICES: '/devices',
	GPX: '/gpx',
	GPX_COLLECTION: '/gpx/$providerId/$collectionId',
	GPX_ROUTE: '/gpx/$providerId/$collectionId/$routeId',
	HOME: '/',
	PROFILE: '/profile',
	SESSION: '/sessions/$sessionId',
	SESSIONS: '/sessions',
	WORKOUT: '/workouts/$workoutId',
	WORKOUTS: '/workouts',
} as const;

export const APP_ROUTE_KIND = {
	DEVICES: 'devices',
	GPX: 'gpx',
	HOME: 'home',
	PROFILE: 'profile',
	SESSION: 'session',
	WORKOUT: 'workout',
} as const;

export type AppRoute =
	| { kind: typeof APP_ROUTE_KIND.DEVICES }
	| {
			collectionId?: string;
			kind: typeof APP_ROUTE_KIND.GPX;
			providerId?: string;
			routeId?: string;
	  }
	| { kind: typeof APP_ROUTE_KIND.HOME }
	| { kind: typeof APP_ROUTE_KIND.PROFILE; profileTab?: ProfileTab }
	| {
			calendarMonth?: string;
			historyView?: SessionHistoryView;
			kind: typeof APP_ROUTE_KIND.SESSION;
			sessionId?: string;
	  }
	| { kind: typeof APP_ROUTE_KIND.WORKOUT; workoutId?: string };

export const HOME_APP_ROUTE: AppRoute = { kind: APP_ROUTE_KIND.HOME };

function matchedSessionRoute(
	sessionId: string | undefined,
	search: Readonly<Record<string, unknown>> | undefined
): AppRoute {
	const parsedMonth = sessionCalendarMonthKeySchema.safeParse(search?.date);
	const calendarMonth = parsedMonth.success ? parsedMonth.data : undefined;
	const parsedView = sessionHistoryViewSchema.safeParse(search?.view);
	const historyView = parsedView.success ? parsedView.data : undefined;
	return {
		...(calendarMonth ? { calendarMonth } : {}),
		...(historyView ? { historyView } : {}),
		kind: APP_ROUTE_KIND.SESSION,
		...(sessionId ? { sessionId } : {}),
	};
}

function matchedProfileRoute(search: Readonly<Record<string, unknown>> | undefined): AppRoute {
	const parsedTab = profileTabSchema.safeParse(search?.tab);
	return {
		kind: APP_ROUTE_KIND.PROFILE,
		...(parsedTab.success ? { profileTab: parsedTab.data } : {}),
	};
}

export function appRouteFromRouterMatch(
	match:
		| {
				params: Readonly<Record<string, string>>;
				routeId: string;
				search?: Readonly<Record<string, unknown>>;
		  }
		| undefined
): AppRoute {
	switch (match?.routeId) {
		case APP_ROUTE_PATH.GPX_ROUTE:
			return match.params.providerId && match.params.collectionId && match.params.routeId
				? {
						collectionId: match.params.collectionId,
						kind: APP_ROUTE_KIND.GPX,
						providerId: match.params.providerId,
						routeId: match.params.routeId,
					}
				: { kind: APP_ROUTE_KIND.GPX };
		case APP_ROUTE_PATH.GPX_COLLECTION:
			return match.params.providerId && match.params.collectionId
				? {
						collectionId: match.params.collectionId,
						kind: APP_ROUTE_KIND.GPX,
						providerId: match.params.providerId,
					}
				: { kind: APP_ROUTE_KIND.GPX };
		case APP_ROUTE_PATH.GPX:
			return { kind: APP_ROUTE_KIND.GPX };
		case APP_ROUTE_PATH.BIKEGPX_ROUTE_LEGACY:
			return match.params.routeId
				? {
						collectionId: 'public-routes',
						kind: APP_ROUTE_KIND.GPX,
						providerId: 'bikegpx',
						routeId: match.params.routeId,
					}
				: { kind: APP_ROUTE_KIND.GPX };
		case APP_ROUTE_PATH.BIKEGPX_LEGACY:
			return {
				collectionId: 'public-routes',
				kind: APP_ROUTE_KIND.GPX,
				providerId: 'bikegpx',
			};
		case APP_ROUTE_PATH.DEVICES:
			return { kind: APP_ROUTE_KIND.DEVICES };
		case APP_ROUTE_PATH.PROFILE:
			return matchedProfileRoute(match.search);
		case APP_ROUTE_PATH.SESSION:
			return matchedSessionRoute(match.params.sessionId, match.search);
		case APP_ROUTE_PATH.SESSIONS:
			return matchedSessionRoute(undefined, match.search);
		case APP_ROUTE_PATH.WORKOUT:
			return match.params.workoutId
				? { kind: APP_ROUTE_KIND.WORKOUT, workoutId: match.params.workoutId }
				: { kind: APP_ROUTE_KIND.WORKOUT };
		case APP_ROUTE_PATH.WORKOUTS:
			return { kind: APP_ROUTE_KIND.WORKOUT };
		default:
			return HOME_APP_ROUTE;
	}
}

export function appRouteSideTray(route: AppRoute): SideTrayOverlay | undefined {
	switch (route.kind) {
		case APP_ROUTE_KIND.GPX:
		case APP_ROUTE_KIND.WORKOUT:
			return APP_OVERLAY.WORKOUTS;
		case APP_ROUTE_KIND.DEVICES:
			return APP_OVERLAY.DEVICES;
		case APP_ROUTE_KIND.PROFILE:
			return APP_OVERLAY.PROFILE;
		case APP_ROUTE_KIND.SESSION:
			return APP_OVERLAY.HISTORY;
		case APP_ROUTE_KIND.HOME:
			return;
		default:
			return unreachable(route);
	}
}
