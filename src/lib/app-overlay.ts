import { isString } from './type-guards';

export const APP_OVERLAY = {
	BUILD: 'build',
	DEVICES: 'devices',
	HISTORY: 'history',
	PRIVACY: 'privacy',
	PROFILE: 'profile',
	SHORTCUTS: 'shortcuts',
	TERMS: 'terms',
	WELCOME: 'welcome',
	WORKOUTS: 'workouts',
} as const;

export type AppOverlay = (typeof APP_OVERLAY)[keyof typeof APP_OVERLAY];

export const OPEN_SIDE_TRAY_STORAGE_KEY = 'ride-control-open-side-tray';

const SIDE_TRAY_OVERLAYS = [
	APP_OVERLAY.DEVICES,
	APP_OVERLAY.HISTORY,
	APP_OVERLAY.WORKOUTS,
] as const;

export type SideTrayOverlay = (typeof SIDE_TRAY_OVERLAYS)[number];

export function isSideTrayOverlay(value: unknown): value is SideTrayOverlay {
	return isString(value) && SIDE_TRAY_OVERLAYS.some((overlay) => overlay === value);
}

function storedOpenSideTray(storage: Pick<Storage, 'getItem'>): string | null {
	try {
		return storage.getItem(OPEN_SIDE_TRAY_STORAGE_KEY);
	} catch {
		return null;
	}
}

export function loadOpenSideTray(
	storage: Pick<Storage, 'getItem'> = localStorage
): SideTrayOverlay | undefined {
	const saved = storedOpenSideTray(storage);
	return isSideTrayOverlay(saved) ? saved : undefined;
}

export function persistOpenSideTray(
	overlay: AppOverlay | undefined,
	storage: Pick<Storage, 'removeItem' | 'setItem'> = localStorage
): boolean {
	try {
		if (isSideTrayOverlay(overlay)) {
			storage.setItem(OPEN_SIDE_TRAY_STORAGE_KEY, overlay);
		} else {
			storage.removeItem(OPEN_SIDE_TRAY_STORAGE_KEY);
		}
		return true;
	} catch {
		return false;
	}
}
