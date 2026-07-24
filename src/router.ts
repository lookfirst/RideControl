import {
	createRootRoute,
	createRoute,
	createRouter,
	type RouterHistory,
	redirect,
} from '@tanstack/react-router';
import { createElement } from 'react';
import { z } from 'zod';
import { App } from './app';
import { emptySession } from './constants';
import { APP_ROUTE_PATH } from './lib/app-route';
import { profileTabSchema } from './lib/profile-tab';
import { sessionCalendarMonthKeySchema } from './lib/session-calendar';
import { sessionHistoryViewSchema } from './lib/session-history-view';
import type { StoredSession } from './types';

const sessionSearchSchema = z.object({
	date: sessionCalendarMonthKeySchema.optional(),
	view: sessionHistoryViewSchema.optional(),
});
const profileSearchSchema = z.object({
	tab: profileTabSchema.optional(),
});

function validateProfileSearch(search: unknown): {
	tab?: z.infer<typeof profileTabSchema>;
} {
	const parsed = profileSearchSchema.safeParse(search);
	return parsed.success ? parsed.data : {};
}

function validateSessionSearch(search: unknown): {
	date?: string;
	view?: z.infer<typeof sessionHistoryViewSchema>;
} {
	const parsed = sessionSearchSchema.safeParse(search);
	return parsed.success ? parsed.data : {};
}

export interface AppRouterOptions {
	history?: RouterHistory;
	initialSession?: StoredSession;
}

export function createAppRouter({ history, initialSession = emptySession }: AppRouterOptions = {}) {
	const rootRoute = createRootRoute({
		component: () => createElement(App, { initialSession }),
	});
	const childRoutes = [
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.HOME }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.DEVICES }),
		createRoute({
			getParentRoute: () => rootRoute,
			path: APP_ROUTE_PATH.PROFILE,
			validateSearch: validateProfileSearch,
		}),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.WORKOUTS }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.WORKOUT }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.GPX }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.GPX_COLLECTION }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.GPX_ROUTE }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.BIKEGPX_LEGACY }),
		createRoute({
			getParentRoute: () => rootRoute,
			path: APP_ROUTE_PATH.BIKEGPX_ROUTE_LEGACY,
		}),
		createRoute({
			getParentRoute: () => rootRoute,
			path: APP_ROUTE_PATH.SESSIONS,
			validateSearch: validateSessionSearch,
		}),
		createRoute({
			getParentRoute: () => rootRoute,
			path: APP_ROUTE_PATH.SESSION,
			validateSearch: validateSessionSearch,
		}),
		createRoute({
			beforeLoad: () => {
				throw redirect({ replace: true, to: APP_ROUTE_PATH.HOME });
			},
			getParentRoute: () => rootRoute,
			path: '$',
		}),
	];
	return createRouter({
		history,
		routeTree: rootRoute.addChildren(childRoutes),
		trailingSlash: 'never',
	});
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
	interface Register {
		router: AppRouter;
	}
}
