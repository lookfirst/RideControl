import { describe, expect, test } from 'bun:test';
import { APP_OVERLAY } from '../src/lib/app-overlay';
import {
	APP_ROUTE_KIND,
	appRouteFromPathname,
	appRoutePath,
	appRouteSideTray,
} from '../src/lib/app-route';

describe('application deep links', () => {
	test('parses direct BikeGPX, workout, session, and devices links', () => {
		expect(appRouteFromPathname('/bikegpx/2635')).toEqual({
			kind: APP_ROUTE_KIND.BIKEGPX,
			routeId: '2635',
		});
		expect(appRouteFromPathname('/workouts/prairie%20roll')).toEqual({
			kind: APP_ROUTE_KIND.WORKOUT,
			workoutId: 'prairie roll',
		});
		expect(appRouteFromPathname('/sessions/ride%2Fmorning')).toEqual({
			kind: APP_ROUTE_KIND.SESSION,
			sessionId: 'ride/morning',
		});
		expect(appRouteFromPathname('/devices')).toEqual({ kind: APP_ROUTE_KIND.DEVICES });
	});

	test('supports collection links and rejects malformed paths', () => {
		expect(appRouteFromPathname('/bikegpx/')).toEqual({
			kind: APP_ROUTE_KIND.BIKEGPX,
		});
		expect(appRouteFromPathname('/workouts')).toEqual({
			kind: APP_ROUTE_KIND.WORKOUT,
		});
		expect(appRouteFromPathname('/sessions')).toEqual({
			kind: APP_ROUTE_KIND.SESSION,
		});
		expect(appRouteFromPathname('/unknown/path')).toEqual({ kind: APP_ROUTE_KIND.HOME });
		expect(appRouteFromPathname('/devices/trainer')).toEqual({ kind: APP_ROUTE_KIND.HOME });
		expect(appRouteFromPathname('/sessions/%E0%A4%A')).toEqual({
			kind: APP_ROUTE_KIND.SESSION,
		});
	});

	test('serializes encoded direct links and selects their parent tray', () => {
		const bikeGpx = { kind: APP_ROUTE_KIND.BIKEGPX, routeId: '26/35' } as const;
		const workout = { kind: APP_ROUTE_KIND.WORKOUT, workoutId: 'hill climb' } as const;
		const session = { kind: APP_ROUTE_KIND.SESSION, sessionId: 'ride#1' } as const;
		const devices = { kind: APP_ROUTE_KIND.DEVICES } as const;
		expect(appRoutePath(bikeGpx)).toBe('/bikegpx/26%2F35');
		expect(appRoutePath(workout)).toBe('/workouts/hill%20climb');
		expect(appRoutePath(session)).toBe('/sessions/ride%231');
		expect(appRoutePath(devices)).toBe('/devices');
		expect(appRouteSideTray(bikeGpx)).toBe(APP_OVERLAY.WORKOUTS);
		expect(appRouteSideTray(workout)).toBe(APP_OVERLAY.WORKOUTS);
		expect(appRouteSideTray(session)).toBe(APP_OVERLAY.HISTORY);
		expect(appRouteSideTray(devices)).toBe(APP_OVERLAY.DEVICES);
	});
});
