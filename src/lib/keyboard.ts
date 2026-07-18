export type AppShortcut = 'endSession' | 'history' | 'newSession' | 'pause' | 'shortcuts';
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

export const historyKeyboardShortcuts = [
	{ keys: ['↑', '↓'], label: 'Select the previous or next session' },
	{ keys: ['←', '→'], label: 'Change the session chart view' },
	{ keys: ['D'], label: 'Delete the selected session' },
	{ keys: ['Enter'], label: 'Confirm session deletion' },
	{ keys: ['?'], label: 'Show history keyboard controls' },
	{ keys: ['Esc'], label: 'Close help or session history' },
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
