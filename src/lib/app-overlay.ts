import { isFiniteNumber, isRecord, isString } from './type-guards';

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
export const SIDE_TRAY_WIDTHS_STORAGE_KEY = 'ride-control-side-tray-widths';

const MAXIMUM_STORED_SIDE_TRAY_WIDTH = 10_000;

const SIDE_TRAY_OVERLAYS = [
	APP_OVERLAY.DEVICES,
	APP_OVERLAY.HISTORY,
	APP_OVERLAY.PROFILE,
	APP_OVERLAY.WORKOUTS,
] as const;

export type SideTrayOverlay = (typeof SIDE_TRAY_OVERLAYS)[number];

type SideTrayWidths = Partial<Record<SideTrayOverlay, number>>;

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

function validStoredSideTrayWidth(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 1 && value <= MAXIMUM_STORED_SIDE_TRAY_WIDTH;
}

function loadSideTrayWidths(storage: Pick<Storage, 'getItem'>): SideTrayWidths {
	try {
		const stored = storage.getItem(SIDE_TRAY_WIDTHS_STORAGE_KEY);
		if (!stored) {
			return {};
		}
		const parsed: unknown = JSON.parse(stored);
		if (!isRecord(parsed)) {
			return {};
		}
		const widths: SideTrayWidths = {};
		for (const overlay of SIDE_TRAY_OVERLAYS) {
			const width = parsed[overlay];
			if (validStoredSideTrayWidth(width)) {
				widths[overlay] = Math.round(width);
			}
		}
		return widths;
	} catch {
		return {};
	}
}

export function loadSideTrayWidth(
	overlay: SideTrayOverlay,
	storage: Pick<Storage, 'getItem'> = localStorage
): number | undefined {
	return loadSideTrayWidths(storage)[overlay];
}

export function persistSideTrayWidth(
	overlay: SideTrayOverlay,
	width: number,
	storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): boolean {
	if (!validStoredSideTrayWidth(width)) {
		return false;
	}
	try {
		const widths = loadSideTrayWidths(storage);
		widths[overlay] = Math.round(width);
		storage.setItem(SIDE_TRAY_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
		return true;
	} catch {
		return false;
	}
}

export function sideTrayWidthWithinViewport(
	preferredWidth: number,
	minimumWidth: number,
	viewportWidth: number
): number {
	const maximum = Math.max(1, Math.round(viewportWidth));
	const minimum = Math.min(maximum, Math.max(1, Math.round(minimumWidth)));
	return Math.min(maximum, Math.max(minimum, Math.round(preferredWidth)));
}
