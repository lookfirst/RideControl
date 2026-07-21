import { describe, expect, test } from 'bun:test';
import {
	loadSelectedSessionId,
	SESSION_HISTORY_SELECTION_STORAGE_KEY,
	saveSelectedSessionId,
	sessionDetailScrollPositionStorageKey,
} from '../src/lib/session-history-preferences';

describe('session history preferences', () => {
	test('gives each session detail pane an independent scroll position key', () => {
		expect(sessionDetailScrollPositionStorageKey('session-1')).toBe(
			'ride-control-session-detail-scroll-position:session-1'
		);
		expect(sessionDetailScrollPositionStorageKey('session-2')).not.toBe(
			sessionDetailScrollPositionStorageKey('session-1')
		);
	});

	test('persists, restores, and clears the selected session', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => values.delete(key),
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadSelectedSessionId(storage)).toBeUndefined();
		expect(saveSelectedSessionId('session-42', storage)).toBe(true);
		expect(values.get(SESSION_HISTORY_SELECTION_STORAGE_KEY)).toBe('session-42');
		expect(loadSelectedSessionId(storage)).toBe('session-42');
		expect(saveSelectedSessionId(undefined, storage)).toBe(true);
		expect(loadSelectedSessionId(storage)).toBeUndefined();
	});

	test('handles unavailable browser storage', () => {
		const storage = {
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

		expect(loadSelectedSessionId(storage)).toBeUndefined();
		expect(saveSelectedSessionId('session-42', storage)).toBe(false);
	});
});
