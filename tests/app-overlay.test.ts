import { describe, expect, test } from 'bun:test';
import {
	APP_OVERLAY,
	isSideTrayOverlay,
	loadOpenSideTray,
	OPEN_SIDE_TRAY_STORAGE_KEY,
	persistOpenSideTray,
} from '../src/lib/app-overlay';

describe('application overlays', () => {
	test('recognizes only side-tray overlays', () => {
		expect(isSideTrayOverlay(APP_OVERLAY.DEVICES)).toBe(true);
		expect(isSideTrayOverlay(APP_OVERLAY.HISTORY)).toBe(true);
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
		for (const overlay of [APP_OVERLAY.DEVICES, APP_OVERLAY.HISTORY, APP_OVERLAY.WORKOUTS]) {
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
});
