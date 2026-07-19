import { strFromU8, unzip } from 'fflate';
import { emptyMetrics, emptySession, MAX_SESSION_HISTORY_SAMPLES } from '../constants';
import type {
	MetricAggregate,
	MetricSample,
	SavedSession,
	SessionAggregates,
	SessionFeeling,
} from '../types';
import { CONTROL_MODE } from './control-mode';
import { errorMessage } from './errors';
import { clampGear } from './gears';
import { nonNegativeNumber } from './numbers';
import { clampResistance } from './resistance';
import { listAllSavedSessions, saveSession } from './saved-sessions';
import { addMetricAggregates } from './session';
import { IMPORTED_TCX_ID_PREFIX, RIDECONTROL_TCX_EXTENSION_NAMESPACE } from './tcx-schema';
import {
	KILOMETERS_PER_HOUR_PER_METER_PER_SECOND,
	kilometersForMeters,
	secondsForMilliseconds,
} from './units';

const TCX_FILE_EXTENSION = /\.tcx$/i;
const ZIP_FILE_EXTENSION = /\.zip$/i;
const MAX_TCX_FILES_PER_IMPORT = 500;
const MAX_TCX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TCX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const ELEMENT_NODE = 1;
const LINE_BREAK = /\r?\n/;
const FEELING_NOTE = /^Feeling:\s*(.+)$/i;
const COMMENTS_NOTE_PREFIX = /^Comments:\s*/i;
const VALID_FEELINGS = new Set<SessionFeeling>(['great', 'good', 'okay', 'tough', 'exhausted']);

interface NamedTcxFile {
	contents: string;
	name: string;
}

interface ImportDependencies {
	listSessions: () => Promise<SavedSession[]>;
	saveSession: (session: SavedSession) => Promise<void>;
}

export interface TcxImportFailure {
	fileName: string;
	message: string;
}

export interface TcxImportResult {
	duplicateCount: number;
	failures: TcxImportFailure[];
	importedSessions: SavedSession[];
	tcxFileCount: number;
}

const DEFAULT_IMPORT_DEPENDENCIES: ImportDependencies = {
	listSessions: listAllSavedSessions,
	saveSession,
};

function elementName(element: Element): string {
	return element.localName || element.nodeName.split(':').at(-1) || element.nodeName;
}

function childElements(element: Element): Element[] {
	return Array.from(element.childNodes).filter(
		(node): node is Element => node.nodeType === ELEMENT_NODE
	);
}

function child(element: Element, name: string): Element | undefined {
	return childElements(element).find((candidate) => elementName(candidate) === name);
}

function descendants(element: Element, name: string): Element[] {
	return Array.from(element.getElementsByTagName('*')).filter(
		(candidate) => elementName(candidate) === name
	);
}

function descendant(element: Element, name: string): Element | undefined {
	return descendants(element, name)[0];
}

function text(element: Element | undefined): string {
	return element?.textContent?.trim() ?? '';
}

function numberValue(element: Element | undefined): number | undefined {
	const value = Number(text(element));
	return Number.isFinite(value) ? value : undefined;
}

function dateValue(value: string): number | undefined {
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

function positiveSum(values: (number | undefined)[]): number {
	return values.reduce<number>((sum, value) => sum + Math.max(0, value ?? 0), 0);
}

function maximum(values: number[]): number {
	return values.reduce((highest, value) => Math.max(highest, value), 0);
}

function evenlySample<T>(values: T[], limit: number): T[] {
	if (values.length <= limit) {
		return values;
	}
	return Array.from({ length: limit }, (_, index) => {
		const sourceIndex = Math.round((index * (values.length - 1)) / (limit - 1));
		return values[sourceIndex] as T;
	});
}

function notesMetadata(activity: Element): Pick<SavedSession, 'comments' | 'feeling'> {
	const notes = text(child(activity, 'Notes'));
	if (!notes) {
		return { comments: '' };
	}
	const lines = notes.split(LINE_BREAK);
	let feeling: SessionFeeling | undefined;
	const commentLines: string[] = [];
	for (const line of lines) {
		const feelingMatch = FEELING_NOTE.exec(line);
		if (feelingMatch) {
			const value = feelingMatch[1]?.trim().toLowerCase() as SessionFeeling;
			if (VALID_FEELINGS.has(value)) {
				feeling = value;
				continue;
			}
		}
		commentLines.push(line.replace(COMMENTS_NOTE_PREFIX, ''));
	}
	return {
		comments: commentLines.join('\n').trim(),
		feeling,
	};
}

function trackpointSample(
	trackpoint: Element,
	startedAt: number,
	previous?: { distanceMeters?: number; elapsedSeconds: number }
): { distanceMeters?: number; sample: MetricSample; timestamp?: number } {
	const timestamp = dateValue(text(child(trackpoint, 'Time')));
	const previousElapsedSeconds = previous ? previous.elapsedSeconds : 0;
	const elapsedSeconds =
		timestamp === undefined
			? previousElapsedSeconds
			: Math.max(0, secondsForMilliseconds(timestamp - startedAt));
	const distanceMeters = numberValue(child(trackpoint, 'DistanceMeters'));
	const elapsedDelta = previous ? elapsedSeconds - previousElapsedSeconds : 0;
	const distanceDelta =
		distanceMeters === undefined
			? 0
			: distanceMeters - (previous?.distanceMeters ?? distanceMeters);
	const recordedSpeed = numberValue(descendant(trackpoint, 'Speed'));
	const calculatedSpeed =
		elapsedDelta > 0 && distanceDelta > 0
			? (distanceDelta / elapsedDelta) * KILOMETERS_PER_HOUR_PER_METER_PER_SECOND
			: 0;
	const gear = numberValue(descendant(trackpoint, 'Gear'));
	const resistance = numberValue(descendant(trackpoint, 'Resistance'));
	return {
		distanceMeters,
		sample: {
			cadence: Math.max(0, numberValue(child(trackpoint, 'Cadence')) ?? 0),
			elapsedSeconds,
			gear: gear === undefined ? undefined : clampGear(gear),
			heartRate: Math.max(
				0,
				numberValue(descendant(child(trackpoint, 'HeartRateBpm') ?? trackpoint, 'Value')) ??
					0
			),
			power: Math.max(0, numberValue(descendant(trackpoint, 'Watts')) ?? 0),
			resistance: resistance === undefined ? undefined : clampResistance(resistance),
			speed:
				recordedSpeed === undefined
					? calculatedSpeed
					: Math.max(0, recordedSpeed) * KILOMETERS_PER_HOUR_PER_METER_PER_SECOND,
		},
		timestamp,
	};
}

function fallbackAggregate(laps: Element[], names: string[]): MetricAggregate {
	const values = laps
		.map((lap) =>
			names
				.map((name) => numberValue(descendant(lap, name)))
				.find((value) => value !== undefined)
		)
		.filter((value): value is number => value !== undefined && value >= 0);
	return { count: values.length, maximum: maximum(values), sum: positiveSum(values) };
}

function withAggregateFallback(
	aggregates: SessionAggregates,
	key: keyof SessionAggregates,
	fallback: MetricAggregate
): SessionAggregates {
	return aggregates[key].count > 0
		? aggregates
		: {
				...aggregates,
				[key]: fallback,
			};
}

function fingerprintValues(
	startedAt: number,
	elapsedSeconds: number,
	distanceKilometers: number,
	calories: number,
	sampleCount: number
): string {
	return [
		Math.round(nonNegativeNumber(startedAt)),
		Math.round(nonNegativeNumber(elapsedSeconds) * 1000),
		Math.round(nonNegativeNumber(distanceKilometers) * 1_000_000),
		Math.round(nonNegativeNumber(calories)),
		sampleCount,
	].join(':');
}

export function tcxSessionFingerprint(
	session: Pick<
		SavedSession,
		'calories' | 'distance' | 'elapsedSeconds' | 'history' | 'startedAt'
	>
): string {
	return fingerprintValues(
		session.startedAt,
		session.elapsedSeconds,
		session.distance,
		session.calories,
		session.history.length
	);
}

function parseActivity(activity: Element): SavedSession {
	const laps = childElements(activity).filter((element) => elementName(element) === 'Lap');
	const trackpoints = descendants(activity, 'Trackpoint');
	const firstTrackpointTime = trackpoints[0]
		? dateValue(text(child(trackpoints[0], 'Time')))
		: undefined;
	const firstLapTime = dateValue(laps[0]?.getAttribute('StartTime') ?? '');
	const startedAt = dateValue(text(child(activity, 'Id'))) ?? firstLapTime ?? firstTrackpointTime;
	if (startedAt === undefined) {
		throw new Error('The activity has no valid start time.');
	}

	let previous: { distanceMeters?: number; elapsedSeconds: number } | undefined;
	let lastTrackpointTime: number | undefined;
	const allSamples = trackpoints.map((trackpoint) => {
		const parsed = trackpointSample(trackpoint, startedAt, previous);
		previous = {
			distanceMeters: parsed.distanceMeters,
			elapsedSeconds: parsed.sample.elapsedSeconds,
		};
		lastTrackpointTime = parsed.timestamp ?? lastTrackpointTime;
		return parsed.sample;
	});
	const lapElapsedSeconds = positiveSum(
		laps.map((lap) => numberValue(child(lap, 'TotalTimeSeconds')))
	);
	const sampleElapsedSeconds = allSamples.at(-1)?.elapsedSeconds ?? 0;
	const elapsedSeconds = Math.max(lapElapsedSeconds, sampleElapsedSeconds);
	const endedAt = Math.max(startedAt, lastTrackpointTime ?? startedAt + elapsedSeconds * 1000);
	const lapDistanceMeters = positiveSum(
		laps.map((lap) => numberValue(child(lap, 'DistanceMeters')))
	);
	const trackpointDistanceMeters = Math.max(
		0,
		...trackpoints.map((trackpoint) => numberValue(child(trackpoint, 'DistanceMeters')) ?? 0)
	);
	const distanceMeters = lapDistanceMeters || trackpointDistanceMeters;
	const calories = positiveSum(laps.map((lap) => numberValue(child(lap, 'Calories'))));
	const exportedSessionId = descendants(activity, 'SessionId').find(
		(element) => element.namespaceURI === RIDECONTROL_TCX_EXTENSION_NAMESPACE
	);
	const hasGear =
		allSamples.some((sample) => sample.gear !== undefined) ||
		descendant(activity, 'AverageGear') !== undefined;
	let aggregates = allSamples.reduce(addMetricAggregates, emptySession.aggregates);
	aggregates = withAggregateFallback(aggregates, 'cadence', fallbackAggregate(laps, ['Cadence']));
	aggregates = withAggregateFallback(
		aggregates,
		'heartRate',
		fallbackAggregate(laps, ['AverageHeartRateBpm'])
	);
	aggregates = withAggregateFallback(aggregates, 'power', fallbackAggregate(laps, ['AvgWatts']));

	return {
		...notesMetadata(activity),
		aggregates,
		calories,
		controlMode: hasGear ? CONTROL_MODE.GEAR : CONTROL_MODE.RESISTANCE,
		distance: kilometersForMeters(distanceMeters),
		elapsedSeconds,
		endedAt,
		history: evenlySample(allSamples, MAX_SESSION_HISTORY_SAMPLES),
		id:
			text(exportedSessionId).slice(0, 256) ||
			`${IMPORTED_TCX_ID_PREFIX}${fingerprintValues(
				startedAt,
				elapsedSeconds,
				kilometersForMeters(distanceMeters),
				calories,
				allSamples.length
			)}`,
		maximums: {
			...emptyMetrics,
			cadence: maximum(allSamples.map((sample) => sample.cadence)),
			heartRate: Math.max(
				maximum(allSamples.map((sample) => sample.heartRate)),
				maximum(laps.map((lap) => numberValue(descendant(lap, 'MaximumHeartRateBpm')) ?? 0))
			),
			power: Math.max(
				maximum(allSamples.map((sample) => sample.power)),
				maximum(laps.map((lap) => numberValue(descendant(lap, 'MaxWatts')) ?? 0))
			),
			speed: Math.max(
				maximum(allSamples.map((sample) => sample.speed)),
				maximum(laps.map((lap) => numberValue(child(lap, 'MaximumSpeed')) ?? 0)) *
					KILOMETERS_PER_HOUR_PER_METER_PER_SECOND
			),
		},
		startedAt,
	};
}

export function parseTcxSessions(contents: string): SavedSession[] {
	const document = new DOMParser().parseFromString(contents, 'application/xml');
	if (document.getElementsByTagName('parsererror').length > 0) {
		throw new Error('The TCX file is not valid XML.');
	}
	const root = document.documentElement;
	if (!root || elementName(root) !== 'TrainingCenterDatabase') {
		throw new Error('The file is not a Training Center XML document.');
	}
	const activities = descendants(root, 'Activity');
	if (activities.length === 0) {
		throw new Error('The TCX file contains no activities.');
	}
	return activities.map(parseActivity);
}

function unzipArchive(data: Uint8Array): Promise<Record<string, Uint8Array>> {
	let tcxFileCount = 0;
	let totalBytes = 0;
	let limitExceeded = false;
	return new Promise((resolve, reject) => {
		unzip(
			data,
			{
				filter: (file) => {
					if (!TCX_FILE_EXTENSION.test(file.name)) {
						return false;
					}
					tcxFileCount += 1;
					totalBytes += file.originalSize;
					limitExceeded =
						tcxFileCount > MAX_TCX_FILES_PER_IMPORT ||
						file.originalSize > MAX_TCX_FILE_BYTES ||
						totalBytes > MAX_TCX_ARCHIVE_BYTES;
					return !limitExceeded;
				},
			},
			(error, files) => {
				if (error) {
					reject(error);
					return;
				}
				if (limitExceeded) {
					reject(new Error('The ZIP contains too many or excessively large TCX files.'));
					return;
				}
				resolve(files);
			}
		);
	});
}

async function uploadedTcxFiles(file: File): Promise<NamedTcxFile[]> {
	if (TCX_FILE_EXTENSION.test(file.name)) {
		if (file.size > MAX_TCX_FILE_BYTES) {
			throw new Error('The TCX file is too large to import.');
		}
		return [{ contents: await file.text(), name: file.name }];
	}
	if (!ZIP_FILE_EXTENSION.test(file.name)) {
		throw new Error('Choose a .tcx file or a .zip containing TCX files.');
	}
	const files = await unzipArchive(new Uint8Array(await file.arrayBuffer()));
	const entries = Object.entries(files);
	if (entries.length === 0) {
		throw new Error('The ZIP contains no TCX files.');
	}
	return entries.map(([name, contents]) => ({ contents: strFromU8(contents), name }));
}

export async function importTcxUpload(
	file: File,
	dependencies: ImportDependencies = DEFAULT_IMPORT_DEPENDENCIES
): Promise<TcxImportResult> {
	const tcxFiles = await uploadedTcxFiles(file);
	const importedAt = Date.now();
	const savedSessions = await dependencies.listSessions();
	const savedIds = new Set(savedSessions.map((session) => session.id));
	const savedFingerprints = new Set(savedSessions.map(tcxSessionFingerprint));
	const result: TcxImportResult = {
		duplicateCount: 0,
		failures: [],
		importedSessions: [],
		tcxFileCount: tcxFiles.length,
	};
	for (const tcxFile of tcxFiles) {
		try {
			const sessions = parseTcxSessions(tcxFile.contents);
			for (const session of sessions) {
				const fingerprint = tcxSessionFingerprint(session);
				if (savedIds.has(session.id) || savedFingerprints.has(fingerprint)) {
					result.duplicateCount += 1;
					continue;
				}
				const importedSession = { ...session, importedAt };
				await dependencies.saveSession(importedSession);
				savedIds.add(session.id);
				savedFingerprints.add(fingerprint);
				result.importedSessions.push(importedSession);
			}
		} catch (error) {
			result.failures.push({ fileName: tcxFile.name, message: errorMessage(error) });
		}
	}
	return result;
}

export function tcxImportResultMessage(result: TcxImportResult): string {
	const messages: string[] = [];
	const imported = result.importedSessions.length;
	if (imported > 0) {
		messages.push(`Imported ${imported} ${imported === 1 ? 'session' : 'sessions'}`);
	} else {
		messages.push('No new sessions imported');
	}
	if (result.duplicateCount > 0) {
		messages.push(
			`${result.duplicateCount} ${result.duplicateCount === 1 ? 'duplicate' : 'duplicates'} skipped`
		);
	}
	if (result.failures.length > 0) {
		messages.push(
			`${result.failures.length} ${result.failures.length === 1 ? 'file' : 'files'} could not be imported`
		);
	}
	return messages.join(' · ');
}
