import { describe, expect, test } from 'bun:test';
import {
	appShortcutForKey,
	dashboardKeyboardShortcuts,
	gearingKeyboardShortcuts,
	historyKeyboardShortcuts,
	historyShortcutForKey,
} from '../src/lib/keyboard';

describe('keyboard shortcuts', () => {
	test('maps history, help, session, and pause keys', () => {
		expect(appShortcutForKey({ code: 'KeyH', key: 'h' })).toBe('history');
		expect(appShortcutForKey({ code: 'KeyH', key: 'H' })).toBe('history');
		expect(appShortcutForKey({ code: 'KeyN', key: 'n' })).toBe('newSession');
		expect(appShortcutForKey({ code: 'KeyN', key: 'N' })).toBe('newSession');
		expect(appShortcutForKey({ code: 'KeyQ', key: 'q' })).toBe('endSession');
		expect(appShortcutForKey({ code: 'KeyQ', key: 'Q' })).toBe('endSession');
		expect(appShortcutForKey({ code: 'Slash', key: '?' })).toBe('shortcuts');
		expect(appShortcutForKey({ code: 'Space', key: ' ' })).toBe('pause');
	});

	test('ignores keys without an application shortcut', () => {
		expect(appShortcutForKey({ code: 'KeyR', key: 'r' })).toBeUndefined();
	});

	test('groups main-screen session controls together', () => {
		expect(dashboardKeyboardShortcuts.slice(0, 4).map((shortcut) => shortcut.label)).toEqual([
			'Pause or resume the session',
			'End the current session',
			'Start a new session after ending',
			'Open session history',
		]);
		expect(dashboardKeyboardShortcuts.slice(0, 4).map((shortcut) => shortcut.group)).toEqual([
			'Session',
			'Session',
			'Session',
			'Session',
		]);
		expect(dashboardKeyboardShortcuts.slice(1, 4).map((shortcut) => shortcut.keys[0])).toEqual([
			'q',
			'n',
			'h',
		]);
	});

	test('describes gear keys when Click is paired', () => {
		expect(gearingKeyboardShortcuts[4]?.label).toBe('Shift to a harder or easier gear');
	});

	test('maps history navigation keys', () => {
		expect(historyShortcutForKey('ArrowUp')).toBe('previousSession');
		expect(historyShortcutForKey('ArrowDown')).toBe('nextSession');
		expect(historyShortcutForKey('d')).toBe('deleteSession');
		expect(historyShortcutForKey('D')).toBe('deleteSession');
		expect(historyShortcutForKey('Enter')).toBe('confirmDelete');
		expect(historyKeyboardShortcuts[2]?.keys).toEqual(['d']);
		expect(historyShortcutForKey('?')).toBe('help');
		expect(historyShortcutForKey('Escape')).toBe('close');
		expect(historyShortcutForKey('ArrowLeft')).toBeUndefined();
	});
});
