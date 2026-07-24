import { APP_OVERLAY, type SideTrayOverlay } from './app-overlay';
import { unreachable } from './errors';
import { sessionCalendarMonthKeySchema } from './session-calendar';
import { type SessionHistoryView, sessionHistoryViewSchema } from './session-history-view';

export const APP_ROUTE_PATH = {
	BIKEGPX: '/bikegpx',
	BIKEGPX_ROUTE: '/bikegpx/$routeId',
	DEVICES: '/devices',
	HOME: '/',
	SESSION: '/sessions/$sessionId',
	SESSIONS: '/sessions',
	WORKOUT: '/workouts/$workoutId',
	WORKOUTS: '/workouts',
} as const;

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
		case APP_ROUTE_PATH.BIKEGPX_ROUTE:
			return match.params.routeId
				? { kind: APP_ROUTE_KIND.BIKEGPX, routeId: match.params.routeId }
				: { kind: APP_ROUTE_KIND.BIKEGPX };
		case APP_ROUTE_PATH.BIKEGPX:
			return { kind: APP_ROUTE_KIND.BIKEGPX };
		case APP_ROUTE_PATH.DEVICES:
			return { kind: APP_ROUTE_KIND.DEVICES };
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
