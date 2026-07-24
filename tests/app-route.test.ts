import { describe, expect, test } from 'bun:test';
import { createMemoryHistory } from '@tanstack/react-router';
import { APP_OVERLAY } from '../src/lib/app-overlay';
import {
	APP_ROUTE_KIND,
	APP_ROUTE_PATH,
	appRouteFromRouterMatch,
	appRouteSideTray,
} from '../src/lib/app-route';
import { PROFILE_TAB } from '../src/lib/profile-tab';
import { createAppRouter } from '../src/router';

async function loadedRoute(pathname: string) {
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: [pathname] }),
	});
	await router.load();
	return {
		match: router.state.matches.at(-1),
		redirectHref: router.state.redirect?.options.href,
	};
}

describe('application deep links', () => {
	test('matches direct GPX, workout, session, devices, and profile links', async () => {
		const gpx = await loadedRoute('/gpx/cyclingstage/tour-de-france-2026/7');
		expect(gpx.match?.routeId).toBe(APP_ROUTE_PATH.GPX_ROUTE);
		expect(gpx.match?.params).toEqual({
			collectionId: 'tour-de-france-2026',
			providerId: 'cyclingstage',
			routeId: '7',
		});
		expect(appRouteFromRouterMatch(gpx.match)).toEqual({
			collectionId: 'tour-de-france-2026',
			kind: APP_ROUTE_KIND.GPX,
			providerId: 'cyclingstage',
			routeId: '7',
		});

		const workout = await loadedRoute('/workouts/prairie%20roll');
		expect(workout.match?.routeId).toBe(APP_ROUTE_PATH.WORKOUT);
		expect(workout.match?.params).toEqual({ workoutId: 'prairie roll' });
		expect(appRouteFromRouterMatch(workout.match)).toEqual({
			kind: APP_ROUTE_KIND.WORKOUT,
			workoutId: 'prairie roll',
		});

		const session = await loadedRoute('/sessions/ride%2Fmorning?date=2026-07&view=statistics');
		expect(session.match?.routeId).toBe(APP_ROUTE_PATH.SESSION);
		expect(session.match?.params).toEqual({ sessionId: 'ride/morning' });
		expect(session.match?.search).toEqual({ date: '2026-07', view: 'statistics' });
		expect(appRouteFromRouterMatch(session.match)).toEqual({
			calendarMonth: '2026-07',
			historyView: 'statistics',
			kind: APP_ROUTE_KIND.SESSION,
			sessionId: 'ride/morning',
		});

		const devices = await loadedRoute('/devices');
		expect(devices.match?.routeId).toBe(APP_ROUTE_PATH.DEVICES);
		expect(appRouteFromRouterMatch(devices.match)).toEqual({
			kind: APP_ROUTE_KIND.DEVICES,
		});

		const profile = await loadedRoute('/profile');
		expect(profile.match?.routeId).toBe(APP_ROUTE_PATH.PROFILE);
		expect(appRouteFromRouterMatch(profile.match)).toEqual({
			kind: APP_ROUTE_KIND.PROFILE,
		});
		const profileBikes = await loadedRoute('/profile?tab=bikes');
		expect(profileBikes.match?.search).toEqual({ tab: PROFILE_TAB.BIKES });
		expect(appRouteFromRouterMatch(profileBikes.match)).toEqual({
			kind: APP_ROUTE_KIND.PROFILE,
			profileTab: PROFILE_TAB.BIKES,
		});
	});

	test('matches collection links and redirects unknown paths home', async () => {
		const collection = await loadedRoute('/gpx/bikegpx/public-routes');
		expect(collection.match?.routeId).toBe(APP_ROUTE_PATH.GPX_COLLECTION);
		expect(appRouteFromRouterMatch(collection.match)).toEqual({
			collectionId: 'public-routes',
			kind: APP_ROUTE_KIND.GPX,
			providerId: 'bikegpx',
		});
		expect((await loadedRoute('/gpx')).match?.routeId).toBe(APP_ROUTE_PATH.GPX);
		expect(appRouteFromRouterMatch((await loadedRoute('/bikegpx/2635')).match)).toEqual({
			collectionId: 'public-routes',
			kind: APP_ROUTE_KIND.GPX,
			providerId: 'bikegpx',
			routeId: '2635',
		});
		expect((await loadedRoute('/workouts')).match?.routeId).toBe(APP_ROUTE_PATH.WORKOUTS);
		expect((await loadedRoute('/sessions')).match?.routeId).toBe(APP_ROUTE_PATH.SESSIONS);
		const calendar = await loadedRoute('/sessions?date=2025-12&view=calendar');
		expect(appRouteFromRouterMatch(calendar.match)).toEqual({
			calendarMonth: '2025-12',
			historyView: 'calendar',
			kind: APP_ROUTE_KIND.SESSION,
		});
		expect(
			appRouteFromRouterMatch((await loadedRoute('/sessions?date=2025-13')).match)
		).toEqual({ kind: APP_ROUTE_KIND.SESSION });
		expect(
			appRouteFromRouterMatch(
				(await loadedRoute('/sessions?date=2025-12&view=unknown')).match
			)
		).toEqual({
			calendarMonth: '2025-12',
			kind: APP_ROUTE_KIND.SESSION,
		});
		expect((await loadedRoute('/unknown/path')).redirectHref).toBe(APP_ROUTE_PATH.HOME);
		expect((await loadedRoute('/devices/trainer')).redirectHref).toBe(APP_ROUTE_PATH.HOME);
		expect(appRouteFromRouterMatch((await loadedRoute('/profile?tab=unknown')).match)).toEqual({
			kind: APP_ROUTE_KIND.PROFILE,
		});
	});

	test('builds encoded direct links and selects their parent trays', async () => {
		const router = createAppRouter({
			history: createMemoryHistory({ initialEntries: [APP_ROUTE_PATH.HOME] }),
		});
		await router.load();
		expect(
			router.buildLocation({
				params: {
					collectionId: 'tour/de-france',
					providerId: 'cycling stage',
					routeId: 'stage/1',
				},
				to: APP_ROUTE_PATH.GPX_ROUTE,
			}).href
		).toBe('/gpx/cycling%20stage/tour%2Fde-france/stage%2F1');
		expect(
			router.buildLocation({
				params: { workoutId: 'hill climb' },
				to: APP_ROUTE_PATH.WORKOUT,
			}).href
		).toBe('/workouts/hill%20climb');
		expect(
			router.buildLocation({
				params: { sessionId: 'ride#1' },
				search: { date: '2026-07', view: 'list' },
				to: APP_ROUTE_PATH.SESSION,
			}).href
		).toBe('/sessions/ride%231?date=2026-07&view=list');
		expect(
			router.buildLocation({
				search: { date: '2026-07', view: 'calendar' },
				to: APP_ROUTE_PATH.SESSIONS,
			}).href
		).toBe('/sessions?date=2026-07&view=calendar');
		expect(
			router.buildLocation({
				search: { tab: PROFILE_TAB.BIKES },
				to: APP_ROUTE_PATH.PROFILE,
			}).href
		).toBe('/profile?tab=bikes');

		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.GPX })).toBe(APP_OVERLAY.WORKOUTS);
		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.WORKOUT })).toBe(APP_OVERLAY.WORKOUTS);
		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.SESSION })).toBe(APP_OVERLAY.HISTORY);
		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.DEVICES })).toBe(APP_OVERLAY.DEVICES);
		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.PROFILE })).toBe(APP_OVERLAY.PROFILE);
	});

	test('moves through application history without reloading the dashboard', async () => {
		const history = createMemoryHistory({ initialEntries: [APP_ROUTE_PATH.HOME] });
		const router = createAppRouter({ history });
		await router.load();
		await router.navigate({ to: APP_ROUTE_PATH.DEVICES });
		expect(router.state.location.pathname).toBe(APP_ROUTE_PATH.DEVICES);

		router.history.back();
		await router.load();
		expect(router.state.location.pathname).toBe(APP_ROUTE_PATH.HOME);

		router.history.forward();
		await router.load();
		expect(router.state.location.pathname).toBe(APP_ROUTE_PATH.DEVICES);
	});

	test('moves calendar months through linkable browser history', async () => {
		const history = createMemoryHistory({
			initialEntries: ['/sessions?date=2025-12'],
		});
		const router = createAppRouter({ history });
		await router.load();
		await router.navigate({
			search: { date: '2026-01' },
			to: APP_ROUTE_PATH.SESSIONS,
		});
		expect(router.state.location.href).toBe('/sessions?date=2026-01');

		router.history.back();
		await router.load();
		expect(router.state.location.href).toBe('/sessions?date=2025-12');

		router.history.forward();
		await router.load();
		expect(router.state.location.href).toBe('/sessions?date=2026-01');
	});

	test('moves session views through linkable browser history', async () => {
		const history = createMemoryHistory({
			initialEntries: ['/sessions?date=2025-12&view=calendar'],
		});
		const router = createAppRouter({ history });
		await router.load();
		await router.navigate({
			search: { date: '2025-12', view: 'list' },
			to: APP_ROUTE_PATH.SESSIONS,
		});
		await router.navigate({
			search: { date: '2025-12', view: 'statistics' },
			to: APP_ROUTE_PATH.SESSIONS,
		});
		expect(router.state.location.href).toBe('/sessions?date=2025-12&view=statistics');

		router.history.back();
		await router.load();
		expect(router.state.location.href).toBe('/sessions?date=2025-12&view=list');

		router.history.back();
		await router.load();
		expect(router.state.location.href).toBe('/sessions?date=2025-12&view=calendar');
	});

	test('moves profile tabs through linkable browser history', async () => {
		const history = createMemoryHistory({
			initialEntries: ['/profile?tab=personal'],
		});
		const router = createAppRouter({ history });
		await router.load();
		await router.navigate({
			search: { tab: PROFILE_TAB.BIKES },
			to: APP_ROUTE_PATH.PROFILE,
		});
		expect(router.state.location.href).toBe('/profile?tab=bikes');

		router.history.back();
		await router.load();
		expect(router.state.location.href).toBe('/profile?tab=personal');

		router.history.forward();
		await router.load();
		expect(router.state.location.href).toBe('/profile?tab=bikes');
	});
});
