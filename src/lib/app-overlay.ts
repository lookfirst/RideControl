export const APP_OVERLAY = {
	DEVICES: 'devices',
	HISTORY: 'history',
	SHORTCUTS: 'shortcuts',
	WELCOME: 'welcome',
	WORKOUTS: 'workouts',
} as const;

export type AppOverlay = (typeof APP_OVERLAY)[keyof typeof APP_OVERLAY];
