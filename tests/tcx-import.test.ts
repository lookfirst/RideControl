import { describe, expect, test } from 'bun:test';
import { DOMParser } from '@xmldom/xmldom';
import { strToU8, zipSync } from 'fflate';
import { CONTROL_MODE } from '../src/lib/control-mode';
import { sessionToTcx } from '../src/lib/tcx';
import { importTcxUpload, parseTcxSessions, tcxImportResultMessage } from '../src/lib/tcx-import';
import type { SavedSession } from '../src/types';
import { savedSessionFixture } from './fixtures/saved-session';

Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: DOMParser });

const SESSION_ID_ELEMENT = /\s*<rc:SessionId>.*<\/rc:SessionId>/;
const session: SavedSession = {
	...savedSessionFixture,
	aggregates: {
		...savedSessionFixture.aggregates,
		gear: { count: 2, maximum: 10, sum: 19 },
		resistance: { count: 0, maximum: 0, sum: 0 },
	},
	comments: 'Imported ride notes',
	controlMode: CONTROL_MODE.GEAR,
	history: savedSessionFixture.history.map(({ resistance: _resistance, ...sample }, index) => ({
		...sample,
		gear: 9 + index,
	})),
	id: 'unique-session-id',
};

describe('TCX import', () => {
	test('round trips Ride Control session data and its unique identifier', () => {
		const [imported] = parseTcxSessions(sessionToTcx(session));
		expect(imported?.id).toBe(session.id);
		expect(imported?.controlMode).toBe(CONTROL_MODE.GEAR);
		expect(imported?.history).toHaveLength(2);
		expect(imported?.history[1]).toMatchObject({
			cadence: 82,
			gear: 10,
			heartRate: 142,
			power: 210,
		});
		expect(imported?.distance).toBe(1.5);
		expect(imported?.calories).toBe(220);
		expect(imported?.feeling).toBe('good');
		expect(imported?.comments).toBe('Imported ride notes');
		expect(imported?.aggregates.gear.maximum).toBe(10);
	});

	test('creates a stable fallback identifier for third-party TCX files', () => {
		const withoutSessionId = sessionToTcx(session).replace(SESSION_ID_ELEMENT, '');
		const [first] = parseTcxSessions(withoutSessionId);
		const [second] = parseTcxSessions(withoutSessionId);
		expect(first?.id).toStartWith('tcx:');
		expect(second?.id).toBe(first?.id);
	});

	test('imports TCX files in nested ZIP folders and skips duplicate sessions', async () => {
		const tcx = strToU8(sessionToTcx(session));
		const archive = zipSync({
			'first/ride.tcx': tcx,
			'notes/readme.txt': strToU8('ignored'),
			'second/ride-copy.TCX': tcx,
		});
		const saved = new Map<string, SavedSession>();
		const result = await importTcxUpload(new File([archive], 'rides.zip'), {
			listSessions: () => Promise.resolve([...saved.values()]),
			saveSession: (imported) => {
				saved.set(imported.id, imported);
				return Promise.resolve();
			},
		});
		expect(result.tcxFileCount).toBe(2);
		expect(result.importedSessions).toHaveLength(1);
		expect(result.importedSessions[0]?.importedAt).toBeNumber();
		expect(result.duplicateCount).toBe(1);
		expect(result.failures).toHaveLength(0);
		expect(tcxImportResultMessage(result)).toBe('Imported 1 session · 1 duplicate skipped');
	});

	test('reports invalid files without preventing valid ZIP entries from importing', async () => {
		const archive = zipSync({
			'broken.tcx': strToU8('<not-tcx />'),
			'valid.tcx': strToU8(sessionToTcx(session)),
		});
		const result = await importTcxUpload(new File([archive], 'rides.zip'), {
			listSessions: () => Promise.resolve([]),
			saveSession: () => Promise.resolve(),
		});
		expect(result.importedSessions).toHaveLength(1);
		expect(result.failures).toEqual([
			{
				fileName: 'broken.tcx',
				message: 'The file is not a Training Center XML document.',
			},
		]);
	});

	test('skips a legacy Ride Control export without an embedded session id', async () => {
		const legacyTcx = sessionToTcx(savedSessionFixture).replace(SESSION_ID_ELEMENT, '');
		let saveCount = 0;
		const result = await importTcxUpload(new File([legacyTcx], 'legacy-ride.tcx'), {
			listSessions: () => Promise.resolve([savedSessionFixture]),
			saveSession: () => {
				saveCount += 1;
				return Promise.resolve();
			},
		});
		expect(result.importedSessions).toHaveLength(0);
		expect(result.duplicateCount).toBe(1);
		expect(saveCount).toBe(0);
	});

	test('rejects unsupported uploads and ZIP files without TCX entries', async () => {
		await expect(importTcxUpload(new File(['no'], 'ride.fit'))).rejects.toThrow(
			'Choose a .tcx file or a .zip containing TCX files.'
		);
		const archive = zipSync({ 'readme.txt': strToU8('nothing here') });
		await expect(importTcxUpload(new File([archive], 'rides.zip'))).rejects.toThrow(
			'The ZIP contains no TCX files.'
		);
	});
});
