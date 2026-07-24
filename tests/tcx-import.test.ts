import { describe, expect, test } from 'bun:test';
import { DOMParser } from '@xmldom/xmldom';
import { strToU8, zipSync } from 'fflate';
import { activityImportResultMessage, importActivityUpload } from '../src/lib/activity-import';
import { CONTROL_MODE } from '../src/lib/control-mode';
import { sessionToFit } from '../src/lib/fit';
import { sessionToTcx } from '../src/lib/tcx';
import { parseTcxSessions } from '../src/lib/tcx-import';
import { WORKOUT_COURSES, workoutTerrainAtDistance } from '../src/lib/workouts';
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
		expect(imported).toBeDefined();
		if (!imported) {
			return;
		}
		expect(imported.id).toBe(session.id);
		expect(imported.controlMode).toBe(CONTROL_MODE.GEAR);
		expect(imported.history).toHaveLength(2);
		expect(imported.history[1]).toMatchObject({
			cadence: 82,
			gear: 10,
			heartRate: 142,
			power: 210,
		});
		expect(imported.distance).toBe(1.5);
		expect(imported.calories).toBe(220);
		expect(imported.feeling).toBe('good');
		expect(imported.comments).toBe('Imported ride notes');
		expect(imported.aggregates.gear.maximum).toBe(10);
		expect(imported.profileSnapshot).toEqual(session.profileSnapshot);
	});

	test('imports every TCX trackpoint from a ride longer than the former sample limit', () => {
		const [sample] = session.history;
		if (!sample) {
			throw new Error('Expected a recorded sample fixture.');
		}
		const history = Array.from({ length: 3601 }, (_, index) => ({
			...sample,
			elapsedSeconds: index + 1,
		}));
		const [imported] = parseTcxSessions(
			sessionToTcx({
				...session,
				elapsedSeconds: history.length,
				endedAt: session.startedAt + history.length * 1000,
				history,
			})
		);
		expect(imported?.history).toHaveLength(history.length);
	});

	test('recognizes Ride Control exports created under a previous repository owner', () => {
		const legacyExport = sessionToTcx(session).replace('RideControlOrg', 'previous-owner');
		const [imported] = parseTcxSessions(legacyExport);
		expect(imported?.id).toBe(session.id);
	});

	test('creates a stable fallback identifier for third-party TCX files', () => {
		const withoutSessionId = sessionToTcx(session).replace(SESSION_ID_ELEMENT, '');
		const [first] = parseTcxSessions(withoutSessionId);
		const [second] = parseTcxSessions(withoutSessionId);
		expect(first?.id).toStartWith('tcx:');
		expect(second?.id).toBe(first?.id);
	});

	test('round trips terrain workout definitions and progress samples', () => {
		const course = WORKOUT_COURSES.find((workout) => workout.id === 'highland-loop');
		expect(course).toBeDefined();
		if (!course) {
			return;
		}
		const workoutSession: SavedSession = {
			...session,
			elevationTotals: { ascent: 205.5, descent: 91.25 },
			history: session.history.map((sample, index) => {
				const terrain = workoutTerrainAtDistance(course, index + 1);
				return {
					...sample,
					elevation: terrain.elevation,
					grade: terrain.grade,
					workoutDistance: terrain.distance,
					workoutLap: terrain.lap,
				};
			}),
			workout: { course },
		};
		const [imported] = parseTcxSessions(sessionToTcx(workoutSession));
		expect(imported?.workout).toBeDefined();
		if (!imported?.workout) {
			return;
		}
		expect(imported.workout.course).toMatchObject({
			description: course.description,
			difficulty: course.difficulty,
			distance: course.distance,
			id: course.id,
			name: course.name,
			routeType: course.routeType,
		});
		expect(imported.workout.course.points).toHaveLength(course.points.length);
		const importedPoint = imported.workout.course.points.at(1);
		const sourcePoint = course.points.at(1);
		expect(importedPoint?.latitude).toBeCloseTo(sourcePoint?.latitude ?? 0, 7);
		expect(imported.history[0]).toMatchObject({
			workoutDistance: 1,
			workoutLap: 1,
		});
		expect(imported.history[0]?.elevation).toBeNumber();
		expect(imported.history[0]?.grade).toBeNumber();
		expect(imported.elevationTotals).toEqual({ ascent: 205.5, descent: 91.25 });
	});

	test('imports TCX files in nested ZIP folders and skips duplicate sessions', async () => {
		const tcx = strToU8(sessionToTcx(session));
		const archive = zipSync({
			'first/ride.tcx': tcx,
			'notes/readme.txt': strToU8('ignored'),
			'second/ride-copy.TCX': tcx,
		});
		const saved = new Map<string, SavedSession>();
		const result = await importActivityUpload(new File([archive], 'rides.zip'), {
			listSessions: () => Promise.resolve([...saved.values()]),
			saveSession: (imported) => {
				saved.set(imported.id, imported);
				return Promise.resolve();
			},
		});
		expect(result.activityFileCount).toBe(2);
		expect(result.importedSessions).toHaveLength(1);
		expect(result.importedSessions[0]?.importedAt).toBeNumber();
		expect(result.duplicateCount).toBe(1);
		expect(result.failures).toHaveLength(0);
		expect(activityImportResultMessage(result)).toBe(
			'Imported 1 session · 1 duplicate skipped'
		);
	});

	test('reports invalid files without preventing valid ZIP entries from importing', async () => {
		const archive = zipSync({
			'broken.tcx': strToU8('<not-tcx />'),
			'valid.tcx': strToU8(sessionToTcx(session)),
		});
		const result = await importActivityUpload(new File([archive], 'rides.zip'), {
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

	test('imports mixed FIT and TCX archives and detects cross-format duplicates', async () => {
		const archive = zipSync({
			'activities/ride.fit': await sessionToFit(session),
			'activities/ride.tcx': strToU8(sessionToTcx(session)),
		});
		const saved: SavedSession[] = [];
		const result = await importActivityUpload(new File([archive], 'mixed-rides.zip'), {
			listSessions: () => Promise.resolve(saved),
			saveSession: (imported) => {
				saved.push(imported);
				return Promise.resolve();
			},
		});
		expect(result.activityFileCount).toBe(2);
		expect(result.importedSessions).toHaveLength(1);
		expect(result.duplicateCount).toBe(1);
		expect(result.failures).toHaveLength(0);
	});

	test('skips a legacy Ride Control export without an embedded session id', async () => {
		const legacyTcx = sessionToTcx(savedSessionFixture).replace(SESSION_ID_ELEMENT, '');
		let saveCount = 0;
		const result = await importActivityUpload(new File([legacyTcx], 'legacy-ride.tcx'), {
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
		await expect(importActivityUpload(new File(['no'], 'ride.gpx'))).rejects.toThrow(
			'Choose a .fit or .tcx file, or a .zip containing activity files.'
		);
		const archive = zipSync({ 'readme.txt': strToU8('nothing here') });
		await expect(importActivityUpload(new File([archive], 'rides.zip'))).rejects.toThrow(
			'The ZIP contains no FIT or TCX activity files.'
		);
	});
});
