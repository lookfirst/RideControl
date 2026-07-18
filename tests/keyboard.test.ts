import { describe, expect, test } from 'bun:test';
import { appShortcutForKey, historyShortcutForKey } from '../src/lib/keyboard';

describe('keyboard shortcuts', () => {
	test('maps history, help, new session, and pause keys', () => {
		expect(appShortcutForKey({ code: 'KeyH', key: 'h' })).toBe('history');
		expect(appShortcutForKey({ code: 'KeyH', key: 'H' })).toBe('history');
		expect(appShortcutForKey({ code: 'KeyN', key: 'n' })).toBe('newSession');
		expect(appShortcutForKey({ code: 'KeyN', key: 'N' })).toBe('newSession');
		expect(appShortcutForKey({ code: 'Slash', key: '?' })).toBe('shortcuts');
		expect(appShortcutForKey({ code: 'Space', key: ' ' })).toBe('pause');
	});

	test('ignores keys without an application shortcut', () => {
		expect(appShortcutForKey({ code: 'KeyR', key: 'r' })).toBeUndefined();
	});

	test('maps history navigation keys', () => {
		expect(historyShortcutForKey('ArrowUp')).toBe('previousSession');
		expect(historyShortcutForKey('ArrowDown')).toBe('nextSession');
		expect(historyShortcutForKey('d')).toBe('deleteSession');
		expect(historyShortcutForKey('D')).toBe('deleteSession');
		expect(historyShortcutForKey('Enter')).toBe('confirmDelete');
		expect(historyShortcutForKey('?')).toBe('help');
		expect(historyShortcutForKey('Escape')).toBe('close');
		expect(historyShortcutForKey('ArrowLeft')).toBeUndefined();
	});
});
