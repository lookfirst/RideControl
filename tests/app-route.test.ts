import { describe, expect, test } from 'bun:test';
import { createMemoryHistory } from '@tanstack/react-router';
import { APP_OVERLAY } from '../src/lib/app-overlay';
import {
	APP_ROUTE_KIND,
	APP_ROUTE_PATH,
	appRouteFromRouterMatch,
	appRouteSideTray,
} from '../src/lib/app-route';
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
	test('matches direct BikeGPX, workout, session, and devices links', async () => {
		const bikeGpx = await loadedRoute('/bikegpx/2635');
		expect(bikeGpx.match?.routeId).toBe(APP_ROUTE_PATH.BIKEGPX_ROUTE);
		expect(bikeGpx.match?.params).toEqual({ routeId: '2635' });
		expect(appRouteFromRouterMatch(bikeGpx.match)).toEqual({
			kind: APP_ROUTE_KIND.BIKEGPX,
			routeId: '2635',
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
	});

	test('matches collection links and redirects unknown paths home', async () => {
		expect((await loadedRoute('/bikegpx')).match?.routeId).toBe(APP_ROUTE_PATH.BIKEGPX);
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
	});

	test('builds encoded direct links and selects their parent trays', async () => {
		const router = createAppRouter({
			history: createMemoryHistory({ initialEntries: [APP_ROUTE_PATH.HOME] }),
		});
		await router.load();
		expect(
			router.buildLocation({
				params: { routeId: '26/35' },
				to: APP_ROUTE_PATH.BIKEGPX_ROUTE,
			}).href
		).toBe('/bikegpx/26%2F35');
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

		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.BIKEGPX })).toBe(APP_OVERLAY.WORKOUTS);
		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.WORKOUT })).toBe(APP_OVERLAY.WORKOUTS);
		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.SESSION })).toBe(APP_OVERLAY.HISTORY);
		expect(appRouteSideTray({ kind: APP_ROUTE_KIND.DEVICES })).toBe(APP_OVERLAY.DEVICES);
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
});
