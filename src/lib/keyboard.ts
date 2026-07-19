export type AppShortcut = 'endSession' | 'history' | 'newSession' | 'pause' | 'shortcuts';
export interface KeyboardShortcutDescription {
	group?: string;
	keys: string[];
	label: string;
}
export type HistoryShortcut =
	| 'close'
	| 'confirmDelete'
	| 'deleteSession'
	| 'help'
	| 'nextSession'
	| 'previousSession';

const historyShortcuts: Record<string, HistoryShortcut> = {
	'?': 'help',
	ArrowDown: 'nextSession',
	ArrowUp: 'previousSession',
	D: 'deleteSession',
	d: 'deleteSession',
	Enter: 'confirmDelete',
	Escape: 'close',
};

export const dashboardKeyboardShortcuts: KeyboardShortcutDescription[] = [
	{ group: 'Session', keys: ['Space'], label: 'Pause or resume the session' },
	{ group: 'Session', keys: ['q'], label: 'End the current session' },
	{ group: 'Session', keys: ['n'], label: 'Start a new session after ending' },
	{ group: 'Session', keys: ['h'], label: 'Open session history' },
	{ group: 'Ride controls', keys: ['↑', '↓'], label: 'Increase or decrease resistance' },
	{ group: 'Ride controls', keys: ['←', '→'], label: 'Change the chart view' },
	{ group: 'General', keys: ['?'], label: 'Show keyboard shortcuts' },
	{ group: 'General', keys: ['Esc'], label: 'Close an open dialog' },
];

export const gearingKeyboardShortcuts: KeyboardShortcutDescription[] =
	dashboardKeyboardShortcuts.map((shortcut) =>
		shortcut.label === 'Increase or decrease resistance'
			? { ...shortcut, label: 'Shift to a harder or easier gear' }
			: shortcut
	);

export const historyKeyboardShortcuts: KeyboardShortcutDescription[] = [
	{ group: 'Navigation', keys: ['↑', '↓'], label: 'Select the previous or next session' },
	{ group: 'Navigation', keys: ['←', '→'], label: 'Change the session chart view' },
	{ group: 'Session', keys: ['d'], label: 'Delete the selected session' },
	{ group: 'Session', keys: ['Enter'], label: 'Confirm session deletion' },
	{ group: 'General', keys: ['?'], label: 'Show history keyboard controls' },
	{ group: 'General', keys: ['Esc'], label: 'Close help or session history' },
];

export function appShortcutForKey({ code, key }: Pick<KeyboardEvent, 'code' | 'key'>) {
	if (key.toLowerCase() === 'h') {
		return 'history' satisfies AppShortcut;
	}
	if (key.toLowerCase() === 'n') {
		return 'newSession' satisfies AppShortcut;
	}
	if (key.toLowerCase() === 'q') {
		return 'endSession' satisfies AppShortcut;
	}
	if (key === '?') {
		return 'shortcuts' satisfies AppShortcut;
	}
	if (code === 'Space') {
		return 'pause' satisfies AppShortcut;
	}
}

export function historyShortcutForKey(key: string): HistoryShortcut | undefined {
	return historyShortcuts[key];
}
