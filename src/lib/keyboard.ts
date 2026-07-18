export type AppShortcut = 'history' | 'newSession' | 'pause' | 'shortcuts';
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

export function appShortcutForKey({ code, key }: Pick<KeyboardEvent, 'code' | 'key'>) {
	if (key.toLowerCase() === 'h') {
		return 'history' satisfies AppShortcut;
	}
	if (key.toLowerCase() === 'n') {
		return 'newSession' satisfies AppShortcut;
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
