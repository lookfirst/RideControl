import { strToU8, zip } from 'fflate';
import type { SavedSession } from '../types';
import { downloadBrowserFile } from './download';
import { sessionTcxFilename, sessionToTcx } from './tcx';

const TCX_ARCHIVE_FOLDER = 'ride-control-tcx';
const TCX_EXTENSION_LENGTH = '.tcx'.length;
const TCX_ARCHIVE_MIME_TYPE = 'application/zip';

function numberedTcxFilename(filename: string, number: number): string {
	if (number === 1) {
		return filename;
	}
	return `${filename.slice(0, -TCX_EXTENSION_LENGTH)}-${number}.tcx`;
}

export function sessionTcxArchiveEntries(sessions: SavedSession[]): Record<string, Uint8Array> {
	const filenameCounts = new Map<string, number>();
	return Object.fromEntries(
		sessions.map((session) => {
			const filename = sessionTcxFilename(session);
			const count = (filenameCounts.get(filename) ?? 0) + 1;
			filenameCounts.set(filename, count);
			return [
				`${TCX_ARCHIVE_FOLDER}/${numberedTcxFilename(filename, count)}`,
				strToU8(sessionToTcx(session)),
			];
		})
	);
}

export function createSessionTcxArchive(sessions: SavedSession[]): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		zip(sessionTcxArchiveEntries(sessions), { level: 6 }, (error, archive) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(archive);
		});
	});
}

export function sessionTcxArchiveFilename(timestamp = Date.now()): string {
	return `ride-control-tcx-${new Date(timestamp).toISOString().slice(0, 10)}.zip`;
}

export async function downloadSessionTcxArchive(sessions: SavedSession[]): Promise<void> {
	if (sessions.length === 0) {
		throw new Error('There are no saved sessions to download.');
	}
	const archive = await createSessionTcxArchive(sessions);
	const archiveBuffer = new ArrayBuffer(archive.byteLength);
	new Uint8Array(archiveBuffer).set(archive);
	downloadBrowserFile(archiveBuffer, sessionTcxArchiveFilename(), TCX_ARCHIVE_MIME_TYPE);
}
