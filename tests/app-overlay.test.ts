import { describe, expect, test } from 'bun:test';
import {
	APP_OVERLAY,
	isSideTrayOverlay,
	loadOpenSideTray,
	loadSideTrayWidth,
	OPEN_SIDE_TRAY_STORAGE_KEY,
	persistOpenSideTray,
	persistSideTrayWidth,
	SIDE_TRAY_WIDTHS_STORAGE_KEY,
	sideTrayWidthWithinViewport,
} from '../src/lib/app-overlay';

describe('application overlays', () => {
	test('recognizes only side-tray overlays', () => {
		expect(isSideTrayOverlay(APP_OVERLAY.DEVICES)).toBe(true);
		expect(isSideTrayOverlay(APP_OVERLAY.HISTORY)).toBe(true);
		expect(isSideTrayOverlay(APP_OVERLAY.PROFILE)).toBe(true);
		expect(isSideTrayOverlay(APP_OVERLAY.WORKOUTS)).toBe(true);
		expect(isSideTrayOverlay(APP_OVERLAY.SHORTCUTS)).toBe(false);
		expect(isSideTrayOverlay(APP_OVERLAY.WELCOME)).toBe(false);
		expect(isSideTrayOverlay('unknown')).toBe(false);
	});

	test('persists, restores, and clears the open side tray', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => values.delete(key),
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadOpenSideTray(storage)).toBeUndefined();
		for (const overlay of [
			APP_OVERLAY.DEVICES,
			APP_OVERLAY.HISTORY,
			APP_OVERLAY.PROFILE,
			APP_OVERLAY.WORKOUTS,
		]) {
			expect(persistOpenSideTray(overlay, storage)).toBe(true);
			expect(loadOpenSideTray(storage)).toBe(overlay);
		}
		expect(persistOpenSideTray(APP_OVERLAY.SHORTCUTS, storage)).toBe(true);
		expect(values.has(OPEN_SIDE_TRAY_STORAGE_KEY)).toBe(false);
		expect(loadOpenSideTray(storage)).toBeUndefined();
	});

	test('ignores invalid and unavailable storage', () => {
		const invalidStorage = {
			getItem: () => APP_OVERLAY.WELCOME,
		};
		expect(loadOpenSideTray(invalidStorage)).toBeUndefined();

		const unavailableStorage = {
			getItem: () => {
				throw new Error('Unavailable');
			},
			removeItem: () => {
				throw new Error('Unavailable');
			},
			setItem: () => {
				throw new Error('Unavailable');
			},
		};
		expect(loadOpenSideTray(unavailableStorage)).toBeUndefined();
		expect(persistOpenSideTray(APP_OVERLAY.DEVICES, unavailableStorage)).toBe(false);
	});

	test('persists an independent validated width for every side tray', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadSideTrayWidth(APP_OVERLAY.DEVICES, storage)).toBeUndefined();
		expect(persistSideTrayWidth(APP_OVERLAY.DEVICES, 640.4, storage)).toBe(true);
		expect(persistSideTrayWidth(APP_OVERLAY.HISTORY, 1280, storage)).toBe(true);
		expect(loadSideTrayWidth(APP_OVERLAY.DEVICES, storage)).toBe(640);
		expect(loadSideTrayWidth(APP_OVERLAY.HISTORY, storage)).toBe(1280);
		expect(loadSideTrayWidth(APP_OVERLAY.PROFILE, storage)).toBeUndefined();
		expect(values.has(SIDE_TRAY_WIDTHS_STORAGE_KEY)).toBe(true);

		values.set(
			SIDE_TRAY_WIDTHS_STORAGE_KEY,
			JSON.stringify({
				devices: -20,
				history: 'wide',
				profile: 720,
				unknown: 900,
			})
		);
		expect(loadSideTrayWidth(APP_OVERLAY.DEVICES, storage)).toBeUndefined();
		expect(loadSideTrayWidth(APP_OVERLAY.HISTORY, storage)).toBeUndefined();
		expect(loadSideTrayWidth(APP_OVERLAY.PROFILE, storage)).toBe(720);
		expect(persistSideTrayWidth(APP_OVERLAY.WORKOUTS, Number.NaN, storage)).toBe(false);
	});

	test('never resizes a side tray below its default or beyond the viewport', () => {
		expect(sideTrayWidthWithinViewport(300, 448, 1440)).toBe(448);
		expect(sideTrayWidthWithinViewport(920, 448, 1440)).toBe(920);
		expect(sideTrayWidthWithinViewport(1800, 448, 1440)).toBe(1440);
		expect(sideTrayWidthWithinViewport(920, 448, 375)).toBe(375);
	});
});
