import { emptyMetrics, emptySession } from '../constants';
import type {
	MetricAggregate,
	MetricSample,
	SavedSession,
	SessionAggregates,
	SessionFeeling,
	SessionWorkout,
} from '../types';
import { sessionImportFingerprint } from './activity-file';
import { CONTROL_MODE } from './control-mode';
import { elevationTotalsForSamples } from './elevation';
import { clampGear } from './gears';
import { nonNegativeNumber } from './numbers';
import { parsedTeeth, riderPhysicsProfileFromStoredValue } from './profile';
import { clampResistance } from './resistance';
import { addMetricAggregates } from './session';
import { IMPORTED_TCX_ID_PREFIX, isRideControlTcxExtensionNamespace } from './tcx-schema';
import {
	KILOMETERS_PER_HOUR_PER_METER_PER_SECOND,
	kilometersForMeters,
	secondsForMilliseconds,
} from './units';
import { restoreSessionWorkout } from './workouts';
import {
	xmlChild as child,
	childElements,
	xmlDescendant as descendant,
	xmlDescendants as descendants,
	elementName,
	xmlNumber as numberValue,
	xmlText as text,
} from './xml';

const LINE_BREAK = /\r?\n/;
const FEELING_NOTE = /^Feeling:\s*(.+)$/i;
const COMMENTS_NOTE_PREFIX = /^Comments:\s*/i;
const VALID_FEELINGS = new Set<SessionFeeling>(['great', 'good', 'okay', 'tough', 'exhausted']);

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
	const elevation = numberValue(child(trackpoint, 'AltitudeMeters'));
	const grade = numberValue(descendant(trackpoint, 'Grade'));
	const workoutDistance = numberValue(descendant(trackpoint, 'WorkoutDistance'));
	const workoutLap = numberValue(descendant(trackpoint, 'WorkoutLap'));
	return {
		distanceMeters,
		sample: {
			cadence: Math.max(0, numberValue(child(trackpoint, 'Cadence')) ?? 0),
			elapsedSeconds,
			elevation: elevation === undefined ? undefined : Math.max(0, elevation),
			gear: gear === undefined ? undefined : clampGear(gear),
			grade,
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
			workoutDistance:
				workoutDistance === undefined ? undefined : Math.max(0, workoutDistance),
			workoutLap: workoutLap === undefined ? undefined : Math.max(1, Math.round(workoutLap)),
		},
		timestamp,
	};
}

function activityWorkout(activity: Element): SessionWorkout | undefined {
	const workout = descendant(activity, 'Workout');
	if (!workout) {
		return;
	}
	const points = childElements(workout)
		.filter((element) => elementName(element) === 'Point')
		.map((point) => ({
			distance: numberValue(child(point, 'Distance')),
			elevation: numberValue(child(point, 'Elevation')),
			latitude: numberValue(child(point, 'Latitude')),
			longitude: numberValue(child(point, 'Longitude')),
			x: numberValue(child(point, 'X')),
			y: numberValue(child(point, 'Y')),
		}));
	return restoreSessionWorkout({
		course: {
			description: text(child(workout, 'Description')),
			difficulty: text(child(workout, 'Difficulty')),
			distance: numberValue(child(workout, 'Distance')),
			id: text(child(workout, 'CourseId')),
			name: text(child(workout, 'Name')),
			points,
			routeType: text(child(workout, 'CourseType')) || undefined,
		},
	});
}

function activityProfileSnapshot(activity: Element) {
	const profile = descendants(activity, 'ProfileSnapshot').find((element) =>
		isRideControlTcxExtensionNamespace(element.namespaceURI)
	);
	if (!profile) {
		return;
	}
	return riderPhysicsProfileFromStoredValue({
		bikeWeightKg: numberValue(child(profile, 'BikeWeightKilograms')),
		frontChainringTeeth: parsedTeeth(text(child(profile, 'FrontChainrings'))),
		rearCassetteTeeth: parsedTeeth(text(child(profile, 'RearCassette'))),
		riderWeightKg: numberValue(child(profile, 'RiderWeightKilograms')),
	});
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
	return sessionImportFingerprint(session);
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
	const trackpointDistanceMeters = maximum(
		trackpoints.map((trackpoint) => numberValue(child(trackpoint, 'DistanceMeters')) ?? 0)
	);
	const distanceMeters = lapDistanceMeters || trackpointDistanceMeters;
	const calories = positiveSum(laps.map((lap) => numberValue(child(lap, 'Calories'))));
	const exportedSessionId = descendants(activity, 'SessionId').find((element) =>
		isRideControlTcxExtensionNamespace(element.namespaceURI)
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
	const sampledElevationTotals = elevationTotalsForSamples(allSamples);
	const recordedAscent = numberValue(descendant(activity, 'TotalAscentMeters'));
	const recordedDescent = numberValue(descendant(activity, 'TotalDescentMeters'));

	return {
		...notesMetadata(activity),
		aggregates,
		calories,
		controlMode: hasGear ? CONTROL_MODE.GEAR : CONTROL_MODE.RESISTANCE,
		distance: kilometersForMeters(distanceMeters),
		elapsedSeconds,
		elevationTotals: {
			ascent: nonNegativeNumber(recordedAscent ?? sampledElevationTotals.ascent),
			descent: nonNegativeNumber(recordedDescent ?? sampledElevationTotals.descent),
		},
		endedAt,
		history: allSamples,
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
		profileSnapshot: activityProfileSnapshot(activity),
		startedAt,
		workout: activityWorkout(activity),
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
