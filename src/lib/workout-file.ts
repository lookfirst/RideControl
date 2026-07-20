import type { GeographicRoutePoint, WorkoutCourse } from '../types';
import { evenlySample } from './arrays';
import { downloadBrowserFile } from './download';
import { parseGpxDocument } from './gpx';
import { isRecord } from './type-guards';
import {
	isWorkoutDifficulty,
	isWorkoutRouteType,
	WORKOUT_DIFFICULTY,
	WORKOUT_ROUTE_TYPE,
	type WorkoutDifficulty,
	type WorkoutRouteType,
} from './workout-schema';
import {
	outAndBackRoutePoints,
	restoreWorkoutCourse,
	WORKOUT_COURSES,
	workoutRouteCloses,
} from './workouts';
import { xmlDescendant, xmlEscape, xmlNumber, xmlText } from './xml';

export const CUSTOM_WORKOUTS_STORAGE_KEY = 'ride-control-custom-workouts';
export const WORKOUT_GPX_EXTENSION_NAMESPACE =
	'https://github.com/lookfirst/RideControl/xmlschemas/WorkoutExtension/v1';
export const WORKOUT_GPX_FORMAT_VERSION = 2;

const WORKOUT_LIBRARY_FORMAT = 'ride-control-workout-library';
const WORKOUT_LIBRARY_VERSION = 1;
const WORKOUT_MIME_TYPE = 'application/gpx+xml';
const MAX_CUSTOM_WORKOUTS = 50;
const MAX_WORKOUT_FILE_POINTS = 200;
const MAX_LOOP_SOURCE_POINTS = MAX_WORKOUT_FILE_POINTS - 1;
const MAX_OUT_AND_BACK_SOURCE_POINTS = Math.floor((MAX_WORKOUT_FILE_POINTS - 1) / 2);
const NON_FILENAME_CHARACTERS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const GPX_FILE_EXTENSION = /(?:\.workout)?\.gpx$/i;

interface WorkoutLibraryData {
	courses: WorkoutCourse[];
	format: typeof WORKOUT_LIBRARY_FORMAT;
	version: typeof WORKOUT_LIBRARY_VERSION;
}

function workoutSlug(course: Pick<WorkoutCourse, 'id' | 'name'>): string {
	const slug = (value: string) =>
		value
			.normalize('NFKD')
			.toLowerCase()
			.replace(NON_FILENAME_CHARACTERS, '-')
			.replace(EDGE_HYPHENS, '');
	return slug(course.name) || slug(course.id) || 'workout';
}

function restoredCourses(value: unknown): WorkoutCourse[] {
	if (!(isRecord(value) && Array.isArray(value.courses))) {
		return [];
	}
	const uniqueIds = new Set<string>();
	return value.courses
		.slice(0, MAX_CUSTOM_WORKOUTS)
		.map(restoreWorkoutCourse)
		.filter((course): course is WorkoutCourse => {
			if (!course || uniqueIds.has(course.id) || workoutIsBuiltIn(course.id)) {
				return false;
			}
			uniqueIds.add(course.id);
			return true;
		});
}

function gpxPointXml(point: GeographicRoutePoint): string {
	return `
			<trkpt lat="${point.latitude.toFixed(8)}" lon="${point.longitude.toFixed(8)}">
				<ele>${point.elevation.toFixed(2)}</ele>
				<extensions>
					<rc:DistanceKilometers>${point.distance.toFixed(6)}</rc:DistanceKilometers>
				</extensions>
			</trkpt>`;
}

function routeFingerprint(points: GeographicRoutePoint[]): string {
	const source = points
		.map(
			(point) =>
				`${point.latitude.toFixed(6)},${point.longitude.toFixed(6)},${point.elevation.toFixed(1)}`
		)
		.join('|');
	let hash = 2_166_136_261;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return `gpx-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function workoutMetadata(
	container: Element,
	points: GeographicRoutePoint[]
): {
	baseResistance?: number;
	difficulty: WorkoutDifficulty;
	id: string;
	routeType?: WorkoutRouteType;
} {
	const difficultyValue = xmlText(xmlDescendant(container, 'Difficulty'));
	const routeTypeValue = xmlText(xmlDescendant(container, 'CourseType'));
	return {
		baseResistance: xmlNumber(xmlDescendant(container, 'BaseResistance')),
		difficulty: isWorkoutDifficulty(difficultyValue)
			? difficultyValue
			: WORKOUT_DIFFICULTY.MODERATE,
		id: xmlText(xmlDescendant(container, 'WorkoutId')) || routeFingerprint(points),
		routeType: isWorkoutRouteType(routeTypeValue) ? routeTypeValue : undefined,
	};
}

function workoutNameFromFile(fileName: string): string {
	return fileName.replace(GPX_FILE_EXTENSION, '').trim() || 'Imported GPX workout';
}

function outAndBackPoints(
	points: GeographicRoutePoint[],
	sourceCloses: boolean
): GeographicRoutePoint[] {
	let outbound = points;
	if (sourceCloses) {
		const halfway = (points.at(-1)?.distance ?? 0) / 2;
		const turnaroundIndex = points.reduce(
			(nearestIndex, point, index) =>
				Math.abs(point.distance - halfway) <
				Math.abs((points[nearestIndex]?.distance ?? 0) - halfway)
					? index
					: nearestIndex,
			0
		);
		outbound = points.slice(0, turnaroundIndex + 1);
	}
	return outAndBackRoutePoints(evenlySample(outbound, MAX_OUT_AND_BACK_SOURCE_POINTS));
}

export function workoutIsBuiltIn(id: string): boolean {
	return WORKOUT_COURSES.some((course) => course.id === id);
}

export function workoutFileContents(course: WorkoutCourse): string {
	const points = course.points.map(gpxPointXml).join('');
	return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ride Control" xmlns="http://www.topografix.com/GPX/1/1" xmlns:rc="${WORKOUT_GPX_EXTENSION_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
	<metadata>
		<name>${xmlEscape(course.name)}</name>
		<desc>${xmlEscape(course.description)}</desc>
	</metadata>
	<trk>
		<name>${xmlEscape(course.name)}</name>
		<desc>${xmlEscape(course.description)}</desc>
		<type>Cycling</type>
		<extensions>
			<rc:FormatVersion>${WORKOUT_GPX_FORMAT_VERSION}</rc:FormatVersion>
			<rc:WorkoutId>${xmlEscape(course.id)}</rc:WorkoutId>
			<rc:Difficulty>${course.difficulty}</rc:Difficulty>
			<rc:BaseResistance>${course.baseResistance.toFixed(1)}</rc:BaseResistance>
			<rc:CourseType>${course.routeType}</rc:CourseType>
		</extensions>
		<trkseg>${points}
		</trkseg>
	</trk>
</gpx>
`;
}

export function workoutFilename(course: Pick<WorkoutCourse, 'id' | 'name'>): string {
	return `ride-control-${workoutSlug(course)}.gpx`;
}

export function downloadWorkoutFile(course: WorkoutCourse): void {
	downloadBrowserFile(workoutFileContents(course), workoutFilename(course), WORKOUT_MIME_TYPE);
}

export function parseWorkoutFile(
	source: string,
	parser: DOMParser = new DOMParser(),
	fallbackName = 'Imported GPX workout'
): WorkoutCourse {
	const xml = parser.parseFromString(source, 'text/xml');
	const parsed = parseGpxDocument(xml);
	const root = xml.documentElement;
	const container = xmlDescendant(root, 'trk') ?? xmlDescendant(root, 'rte');
	if (!container) {
		throw new Error('The GPX file does not contain a track or route.');
	}
	const sourcePoints = parsed.points;
	const metadata = workoutMetadata(container, sourcePoints);
	const sourceCloses = workoutRouteCloses(sourcePoints);
	const routeType =
		metadata.routeType ??
		(sourceCloses ? WORKOUT_ROUTE_TYPE.LOOP : WORKOUT_ROUTE_TYPE.OUT_AND_BACK);
	let points: GeographicRoutePoint[];
	if (routeType === WORKOUT_ROUTE_TYPE.OUT_AND_BACK) {
		points = outAndBackPoints(sourcePoints, sourceCloses);
	} else {
		points = evenlySample(sourcePoints, MAX_LOOP_SOURCE_POINTS);
	}
	const distance = points.at(-1)?.distance ?? 0;
	const course = restoreWorkoutCourse({
		baseResistance: metadata.baseResistance,
		description: parsed.description || 'Imported from a GPX route with elevation data.',
		difficulty: metadata.difficulty,
		distance,
		id: metadata.id,
		name: parsed.name || fallbackName,
		points,
		routeType,
	});
	if (!course) {
		throw new Error(
			'The GPX route must describe a valid loop or out-and-back course with increasing distance and elevation data.'
		);
	}
	return course;
}

export async function readWorkoutFile(file: Pick<File, 'name' | 'text'>): Promise<WorkoutCourse> {
	return parseWorkoutFile(await file.text(), new DOMParser(), workoutNameFromFile(file.name));
}

export function loadCustomWorkouts(
	storage: Pick<Storage, 'getItem'> = localStorage
): WorkoutCourse[] {
	try {
		const saved = storage.getItem(CUSTOM_WORKOUTS_STORAGE_KEY);
		if (!saved) {
			return [];
		}
		const parsed: unknown = JSON.parse(saved);
		if (
			!(
				isRecord(parsed) &&
				parsed.format === WORKOUT_LIBRARY_FORMAT &&
				parsed.version === WORKOUT_LIBRARY_VERSION
			)
		) {
			return [];
		}
		return restoredCourses(parsed);
	} catch {
		return [];
	}
}

export function saveCustomWorkouts(
	courses: WorkoutCourse[],
	storage: Pick<Storage, 'setItem'> = localStorage
): void {
	const library: WorkoutLibraryData = {
		courses: courses.slice(0, MAX_CUSTOM_WORKOUTS),
		format: WORKOUT_LIBRARY_FORMAT,
		version: WORKOUT_LIBRARY_VERSION,
	};
	storage.setItem(CUSTOM_WORKOUTS_STORAGE_KEY, JSON.stringify(library));
}

export function addCustomWorkout(
	courses: WorkoutCourse[],
	course: WorkoutCourse
): { course: WorkoutCourse; courses: WorkoutCourse[] } {
	if (workoutIsBuiltIn(course.id)) {
		throw new Error(`${course.name} is already included with Ride Control.`);
	}
	const duplicate = courses.find((existing) => existing.id === course.id);
	if (duplicate) {
		throw new Error(`${duplicate.name} has already been imported.`);
	}
	return {
		course,
		courses: [course, ...courses].slice(0, MAX_CUSTOM_WORKOUTS),
	};
}

export function withoutCustomWorkout(courses: WorkoutCourse[], workoutId: string): WorkoutCourse[] {
	return courses.filter((course) => course.id !== workoutId);
}
