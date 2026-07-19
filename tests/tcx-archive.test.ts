import { describe, expect, test } from 'bun:test';
import { strFromU8, unzipSync } from 'fflate';
import {
	createSessionTcxArchive,
	downloadSessionTcxArchive,
	sessionTcxArchiveEntries,
	sessionTcxArchiveFilename,
} from '../src/lib/tcx-archive';
import { savedSessionFixture } from './fixtures/saved-session';

const FIRST_ARCHIVE_PATH = 'ride-control-tcx/ride-control-2026-07-18T16-00-00.000Z.tcx';
const SECOND_ARCHIVE_PATH = 'ride-control-tcx/ride-control-2026-07-18T16-00-00.000Z-2.tcx';

function archiveFile(files: Record<string, Uint8Array>, path: string): Uint8Array {
	const file = files[path];
	if (!file) {
		throw new Error(`Missing archive file: ${path}`);
	}
	return file;
}

describe('TCX archive export', () => {
	test('places every saved session in one folder with collision-safe filenames', async () => {
		const secondSession = { ...savedSessionFixture, id: 'second-session' };
		const entries = sessionTcxArchiveEntries([savedSessionFixture, secondSession]);
		expect(Object.keys(entries)).toEqual([FIRST_ARCHIVE_PATH, SECOND_ARCHIVE_PATH]);

		const archive = await createSessionTcxArchive([savedSessionFixture, secondSession]);
		const files = unzipSync(archive);
		expect(Object.keys(files)).toEqual([FIRST_ARCHIVE_PATH, SECOND_ARCHIVE_PATH]);
		expect(strFromU8(archiveFile(files, FIRST_ARCHIVE_PATH))).toContain(
			'<rc:SessionId>saved-session</rc:SessionId>'
		);
		expect(strFromU8(archiveFile(files, SECOND_ARCHIVE_PATH))).toContain(
			'<rc:SessionId>second-session</rc:SessionId>'
		);
	});

	test('creates a dated ZIP filename', () => {
		expect(sessionTcxArchiveFilename(Date.UTC(2026, 6, 19, 12))).toBe(
			'ride-control-tcx-2026-07-19.zip'
		);
	});

	test('does not download an empty session archive', async () => {
		await expect(downloadSessionTcxArchive([])).rejects.toThrow(
			'There are no saved sessions to download.'
		);
	});
});
