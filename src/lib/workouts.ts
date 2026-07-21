import { emptyElevationTotals } from '../constants';
import type {
	ElevationTotals,
	GeographicRoutePoint,
	RoutePoint,
	SessionWorkout,
	WorkoutCourse,
	WorkoutRoutePoint,
	WorkoutTerrain,
} from '../types';
import cedarCircuitDefinition from '../workouts/cedar-circuit.json';
import graniteSwitchbacksDefinition from '../workouts/granite-switchbacks.json';
import harborRingDefinition from '../workouts/harbor-ring.json';
import highlandLoopDefinition from '../workouts/highland-loop.json';
import prairieRollDefinition from '../workouts/prairie-roll.json';
import ridgelineTimeTrialDefinition from '../workouts/ridgeline-time-trial.json';
import { elevationTotalsForSamples } from './elevation';
import { distanceBetween } from './gpx';
import { clamp, nonNegativeNumber } from './numbers';
import { clampResistance } from './resistance';
import { isFiniteNumber, isRecord, isString } from './type-guards';
import {
	isWorkoutDescriptionAttribution,
	type WorkoutDescriptionAttribution,
} from './workout-description';
import {
	isWorkoutDifficulty,
	isWorkoutRouteType,
	WORKOUT_DIFFICULTY,
	WORKOUT_ROUTE_TYPE,
	type WorkoutDifficulty,
	type WorkoutRouteType,
} from './workout-schema';

const DEFAULT_TERRAIN_RESISTANCE = 12;
const RESISTANCE_PER_GRADE_PERCENT = 2.25;
const MIN_TERRAIN_RESISTANCE = 4;
const MAX_TERRAIN_RESISTANCE = 55;
const MAX_SAVED_WORKOUT_POINTS = 200;
const MAX_OUT_AND_BACK_OUTBOUND_POINTS = Math.floor((MAX_SAVED_WORKOUT_POINTS + 1) / 2);
const MIN_ROUTE_POINTS = 3;
const MAP_MINIMUM = 0;
const MAP_MAXIMUM = 100;
const MAP_PADDING = 8;
const GENERATED_COURSE_LATITUDE = 39;
const GENERATED_COURSE_LONGITUDE = -105;
const METERS_PER_LATITUDE_DEGREE = 111_320;
const COURSE_CLOSURE_METERS = 100;
const COURSE_ELEVATION_TOLERANCE_METERS = 20;
const OUT_AND_BACK_MATCH_METERS = 1;
const OUT_AND_BACK_ELEVATION_TOLERANCE_METERS = 0.1;
const ROUTE_VALUE_EPSILON = 0.000_001;
const LOW_CLIMB_ELEVATION_GAIN_METERS = 50;
const MODERATE_CLIMB_ELEVATION_GAIN_METERS = 150;
const PROFILE_REFERENCE_ELEVATION_SPAN_METERS = 200;
const SEARCH_WHITESPACE = /\s+/;
export const WORKOUT_SHORT_FLAT_START_DISTANCE = 0.4;
export const WORKOUT_MODERATE_FLAT_START_DISTANCE = 0.8;
export const WORKOUT_FLAT_START_DISTANCE = 1.5;

interface CourseMapPoint extends RoutePoint {
	x: number;
	y: number;
}

interface BuiltInWorkoutDefinition {
	baseResistance: number;
	description: string;
	difficulty: string;
	distance: number;
	id: string;
	name: string;
	points: CourseMapPoint[];
	routeType: string;
}

interface WorkoutDashboardSource {
	distance: number;
	elevationTotals: ElevationTotals;
	ended: boolean;
	selectedWorkout?: SessionWorkout;
	workout?: SessionWorkout;
}

export function workoutDashboardPreview(source: WorkoutDashboardSource) {
	const plannedWorkout = source.ended ? source.selectedWorkout : undefined;
	return plannedWorkout
		? {
				distance: 0,
				elevationTotals: emptyElevationTotals,
				workout: plannedWorkout,
			}
		: {
				distance: source.distance,
				elevationTotals: source.elevationTotals,
				workout: source.workout,
			};
}

function approximatelyEqual(left: number, right: number): boolean {
	return Math.abs(left - right) <= ROUTE_VALUE_EPSILON;
}

function elevationGain(points: RoutePoint[]): number {
	return elevationTotalsForSamples(points).ascent;
}

function flatStartDistanceForElevationGain(elevationGainMeters: number): number {
	if (elevationGainMeters < LOW_CLIMB_ELEVATION_GAIN_METERS) {
		return WORKOUT_SHORT_FLAT_START_DISTANCE;
	}
	if (elevationGainMeters < MODERATE_CLIMB_ELEVATION_GAIN_METERS) {
		return WORKOUT_MODERATE_FLAT_START_DISTANCE;
	}
	return WORKOUT_FLAT_START_DISTANCE;
}

export function workoutFlatStartDistance(course: Pick<WorkoutCourse, 'elevationGain'>): number {
	return flatStartDistanceForElevationGain(course.elevationGain);
}

function flatRouteStart(
	points: GeographicRoutePoint[],
	rolloutDistance: number,
	maximumPoints = MAX_SAVED_WORKOUT_POINTS
): GeographicRoutePoint[] {
	const [first] = points;
	const last = points.at(-1);
	if (!(first && last && rolloutDistance > 0 && rolloutDistance < last.distance)) {
		return points;
	}
	const rightIndex = points.findIndex((point) => point.distance >= rolloutDistance);
	if (rightIndex <= 0) {
		return points;
	}
	const flattened = points.map((point) =>
		point.distance <= rolloutDistance ? { ...point, elevation: first.elevation } : point
	);
	const right = points[rightIndex];
	if (!(right && !approximatelyEqual(right.distance, rolloutDistance))) {
		return flattened;
	}
	const left = points[rightIndex - 1];
	if (!left || right.distance <= left.distance) {
		return flattened;
	}
	const progress = (rolloutDistance - left.distance) / (right.distance - left.distance);
	const boundary: GeographicRoutePoint = {
		distance: rolloutDistance,
		elevation: first.elevation,
		latitude: left.latitude + (right.latitude - left.latitude) * progress,
		longitude: left.longitude + (right.longitude - left.longitude) * progress,
	};
	if (flattened.length >= maximumPoints) {
		return [...flattened.slice(0, rightIndex), boundary, ...flattened.slice(rightIndex + 1)];
	}
	return [...flattened.slice(0, rightIndex), boundary, ...flattened.slice(rightIndex)];
}

function withFlatCourseStart(
	points: GeographicRoutePoint[],
	distance: number,
	routeType: WorkoutRouteType,
	rolloutDistance: number
): GeographicRoutePoint[] {
	if (routeType !== WORKOUT_ROUTE_TYPE.OUT_AND_BACK) {
		return flatRouteStart(points, rolloutDistance);
	}
	const outbound = points.filter((point) => point.distance <= distance / 2 + ROUTE_VALUE_EPSILON);
	return outAndBackRoutePoints(
		flatRouteStart(outbound, rolloutDistance, MAX_OUT_AND_BACK_OUTBOUND_POINTS)
	);
}

export function workoutRouteCloses(points: GeographicRoutePoint[]): boolean {
	const [first] = points;
	const last = points.at(-1);
	const routeDistanceMeters = (last?.distance ?? 0) * 1000;
	const closureThreshold = Math.min(
		COURSE_CLOSURE_METERS,
		Math.max(20, routeDistanceMeters * 0.02)
	);
	return Boolean(
		first &&
			last &&
			distanceBetween(first.latitude, first.longitude, last.latitude, last.longitude) <=
				closureThreshold
	);
}

export function outAndBackRoutePoints(points: GeographicRoutePoint[]): GeographicRoutePoint[] {
	const turnaroundDistance = points.at(-1)?.distance ?? 0;
	return [
		...points,
		...points
			.slice(0, -1)
			.reverse()
			.map((point) => ({
				...point,
				distance: turnaroundDistance * 2 - point.distance,
			})),
	];
}

function mapCoordinates(points: GeographicRoutePoint[]): WorkoutRoutePoint[] {
	const centerLatitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
	const longitudeScale = Math.cos((centerLatitude * Math.PI) / 180);
	const projected = points.map((point) => ({
		point,
		x: point.longitude * longitudeScale,
		y: point.latitude,
	}));
	const xValues = projected.map(({ x }) => x);
	const yValues = projected.map(({ y }) => y);
	const minimumX = Math.min(...xValues);
	const maximumX = Math.max(...xValues);
	const minimumY = Math.min(...yValues);
	const maximumY = Math.max(...yValues);
	const width = maximumX - minimumX;
	const height = maximumY - minimumY;
	const available = MAP_MAXIMUM - MAP_MINIMUM - MAP_PADDING * 2;
	const scale = available / Math.max(width, height, ROUTE_VALUE_EPSILON);
	const centerX = (minimumX + maximumX) / 2;
	const centerY = (minimumY + maximumY) / 2;
	return projected.map(({ point, x, y }) => ({
		...point,
		x: 50 + (x - centerX) * scale,
		y: 50 - (y - centerY) * scale,
	}));
}

function geographicPointsForMap(
	distance: number,
	points: CourseMapPoint[]
): GeographicRoutePoint[] {
	const mapLength = points.slice(1).reduce((sum, point, index) => {
		const previous = points[index];
		return previous ? sum + Math.hypot(point.x - previous.x, point.y - previous.y) : sum;
	}, 0);
	const metersPerMapUnit = (distance * 1000) / Math.max(mapLength, ROUTE_VALUE_EPSILON);
	const metersPerLongitudeDegree =
		METERS_PER_LATITUDE_DEGREE * Math.cos((GENERATED_COURSE_LATITUDE * Math.PI) / 180);
	return points.map((point) => ({
		distance: point.distance,
		elevation: point.elevation,
		latitude:
			GENERATED_COURSE_LATITUDE -
			((point.y - 50) * metersPerMapUnit) / METERS_PER_LATITUDE_DEGREE,
		longitude:
			GENERATED_COURSE_LONGITUDE +
			((point.x - 50) * metersPerMapUnit) / metersPerLongitudeDegree,
	}));
}

function createGeographicCourse(
	id: string,
	name: string,
	description: string,
	difficulty: WorkoutDifficulty,
	distance: number,
	points: GeographicRoutePoint[],
	baseResistance = DEFAULT_TERRAIN_RESISTANCE,
	routeType: WorkoutRouteType = WORKOUT_ROUTE_TYPE.LOOP,
	descriptionAttribution?: WorkoutDescriptionAttribution,
	startingLocation?: string
): WorkoutCourse {
	const [first] = points;
	const rolloutDistance = flatStartDistanceForElevationGain(elevationGain(points));
	const sourcePoints =
		first && routeType !== WORKOUT_ROUTE_TYPE.POINT_TO_POINT
			? points.map((point, index) =>
					index === points.length - 1
						? {
								...point,
								elevation: first.elevation,
								latitude: first.latitude,
								longitude: first.longitude,
							}
						: point
				)
			: points;
	const terrainPoints = mapCoordinates(
		withFlatCourseStart(sourcePoints, distance, routeType, rolloutDistance)
	);
	return {
		baseResistance,
		description,
		descriptionAttribution,
		difficulty,
		distance,
		elevationGain: elevationGain(terrainPoints),
		id,
		name,
		points: terrainPoints,
		routeType,
		startingLocation,
	};
}

function createBuiltInCourse(definition: BuiltInWorkoutDefinition): WorkoutCourse {
	if (!(isWorkoutDifficulty(definition.difficulty) && isWorkoutRouteType(definition.routeType))) {
		throw new Error(`Invalid built-in workout definition: ${definition.id}`);
	}
	return createGeographicCourse(
		definition.id,
		definition.name,
		definition.description,
		definition.difficulty,
		definition.distance,
		geographicPointsForMap(definition.distance, definition.points),
		definition.baseResistance,
		definition.routeType
	);
}

const BUILT_IN_WORKOUT_DEFINITIONS = [
	harborRingDefinition,
	prairieRollDefinition,
	cedarCircuitDefinition,
	highlandLoopDefinition,
	graniteSwitchbacksDefinition,
	ridgelineTimeTrialDefinition,
] satisfies BuiltInWorkoutDefinition[];

export const WORKOUT_COURSES: WorkoutCourse[] =
	BUILT_IN_WORKOUT_DEFINITIONS.map(createBuiltInCourse);

const BUILT_IN_WORKOUT_COURSES_BY_ID = new Map(
	WORKOUT_COURSES.map((course) => [course.id, course])
);

function loopDistance(courseDistance: number, totalDistance: number): number {
	if (courseDistance <= 0) {
		return 0;
	}
	return nonNegativeNumber(totalDistance) % courseDistance;
}

function coursePosition(course: WorkoutCourse, totalDistance: number): number {
	return course.routeType === WORKOUT_ROUTE_TYPE.POINT_TO_POINT
		? clamp(nonNegativeNumber(totalDistance), 0, course.distance)
		: loopDistance(course.distance, totalDistance);
}

function segmentAtDistance(course: WorkoutCourse, distance: number) {
	const position = coursePosition(course, distance);
	const nextIndex = course.points.findIndex((point) => point.distance >= position);
	const rightIndex = Math.max(1, nextIndex < 0 ? course.points.length - 1 : nextIndex);
	const left = course.points[rightIndex - 1] ?? course.points[0];
	const right = course.points[rightIndex] ?? course.points.at(-1);
	if (!(left && right)) {
		return {
			left: {
				distance: 0,
				elevation: 0,
				latitude: 0,
				longitude: 0,
				x: 50,
				y: 50,
			},
			position: 0,
			right: undefined,
		};
	}
	return { left, position, right };
}

function coursePointAtDistance(course: WorkoutCourse, distance: number): WorkoutRoutePoint {
	const { left, position, right } = segmentAtDistance(course, distance);
	if (!right || right.distance === left.distance) {
		return left;
	}
	const segmentProgress = (position - left.distance) / (right.distance - left.distance);
	const mapPosition = workoutMapPosition(course, position);
	return {
		distance: position,
		elevation: curveValueAtX(
			course.points.map((point) => ({ x: point.distance, y: point.elevation })),
			position
		),
		latitude: left.latitude + (right.latitude - left.latitude) * segmentProgress,
		longitude: left.longitude + (right.longitude - left.longitude) * segmentProgress,
		x: mapPosition.x,
		y: mapPosition.y,
	};
}

export function workoutProgress(course: WorkoutCourse, totalDistance: number): number {
	return course.distance <= 0 ? 0 : coursePosition(course, totalDistance) / course.distance;
}

export function workoutSelectionLocked({
	elapsedSeconds,
	ended,
	isRiding,
}: {
	elapsedSeconds: number;
	ended: boolean;
	isRiding: boolean;
}): boolean {
	return !ended && (isRiding || elapsedSeconds > 0);
}

export function workoutLap(course: WorkoutCourse, totalDistance: number): number {
	return course.routeType === WORKOUT_ROUTE_TYPE.POINT_TO_POINT
		? 1
		: workoutCompletedLaps(course, totalDistance) + 1;
}

export function workoutCompletedLaps(course: WorkoutCourse, totalDistance: number): number {
	if (course.distance <= 0) {
		return 0;
	}
	if (course.routeType === WORKOUT_ROUTE_TYPE.POINT_TO_POINT) {
		return nonNegativeNumber(totalDistance) >= course.distance ? 1 : 0;
	}
	return Math.floor(nonNegativeNumber(totalDistance) / course.distance);
}

export function workoutElevationTotalsAtDistance(
	course: WorkoutCourse,
	totalDistance: number
): ElevationTotals {
	const position = coursePosition(course, totalDistance);
	const current = coursePointAtDistance(course, position);
	const partialLap = elevationTotalsForSamples([
		...course.points.filter((point) => point.distance < position),
		current,
	]);
	if (course.routeType === WORKOUT_ROUTE_TYPE.POINT_TO_POINT) {
		return partialLap;
	}
	const completedLaps = workoutCompletedLaps(course, totalDistance);
	const fullLap = elevationTotalsForSamples(course.points);
	return {
		ascent: fullLap.ascent * completedLaps + partialLap.ascent,
		descent: fullLap.descent * completedLaps + partialLap.descent,
	};
}

export function workoutTerrainAtDistance(
	course: WorkoutCourse,
	totalDistance: number
): WorkoutTerrain {
	const distance = coursePosition(course, totalDistance);
	const point = coursePointAtDistance(course, distance);
	const lookAheadDistance = Math.min(0.15, course.distance / 20);
	const gradeDistance =
		course.routeType === WORKOUT_ROUTE_TYPE.POINT_TO_POINT
			? Math.min(lookAheadDistance, course.distance - distance)
			: lookAheadDistance;
	const ahead = coursePointAtDistance(course, distance + gradeDistance);
	const grade =
		gradeDistance > 0
			? clamp(((ahead.elevation - point.elevation) / (gradeDistance * 1000)) * 100, -15, 15)
			: 0;
	const resistance = clampResistance(
		Math.round(
			clamp(
				course.baseResistance + grade * RESISTANCE_PER_GRADE_PERCENT,
				MIN_TERRAIN_RESISTANCE,
				MAX_TERRAIN_RESISTANCE
			)
		)
	);
	return {
		completedLaps: workoutCompletedLaps(course, totalDistance),
		distance,
		elevation: point.elevation,
		grade,
		lap: workoutLap(course, totalDistance),
		progress: workoutProgress(course, totalDistance),
		resistance,
		x: point.x,
		y: point.y,
	};
}

export function workoutMapPath(course: WorkoutCourse): string {
	const [first] = course.points;
	if (!first) {
		return '';
	}
	return [
		`M ${pathCoordinate(first.x)} ${pathCoordinate(first.y)}`,
		...workoutMapSegments(course).map(curvePathCommand),
	].join(' ');
}

export function workoutMapProgressPath(course: WorkoutCourse, terrain: WorkoutTerrain): string {
	const [first] = course.points;
	if (!first) {
		return '';
	}
	const progressDistance =
		course.routeType === WORKOUT_ROUTE_TYPE.OUT_AND_BACK
			? Math.min(terrain.distance, course.distance / 2)
			: terrain.distance;
	const curves: string[] = [];
	for (const segment of workoutMapSegments(course)) {
		if (segment.endDistance <= progressDistance) {
			curves.push(curvePathCommand(segment));
			continue;
		}
		if (segment.startDistance < progressDistance) {
			const progress =
				(progressDistance - segment.startDistance) /
				(segment.endDistance - segment.startDistance);
			curves.push(curvePathCommand(partialCurveSegment(segment, progress)));
		}
		break;
	}
	return [`M ${pathCoordinate(first.x)} ${pathCoordinate(first.y)}`, ...curves].join(' ');
}

interface CurvePoint {
	x: number;
	y: number;
}

interface CurveSegment {
	control1: CurvePoint;
	control2: CurvePoint;
	from: CurvePoint;
	to: CurvePoint;
}

interface MapCurveSegment extends CurveSegment {
	endDistance: number;
	startDistance: number;
}

function pathCoordinate(value: number): number {
	return Number(value.toFixed(3));
}

function curvePointBetween(from: CurvePoint, to: CurvePoint, progress: number): CurvePoint {
	return {
		x: from.x + (to.x - from.x) * progress,
		y: from.y + (to.y - from.y) * progress,
	};
}

function curvePointAtProgress(segment: CurveSegment, progress: number): CurvePoint {
	return {
		x: cubicValue(
			segment.from.x,
			segment.control1.x,
			segment.control2.x,
			segment.to.x,
			progress
		),
		y: cubicValue(
			segment.from.y,
			segment.control1.y,
			segment.control2.y,
			segment.to.y,
			progress
		),
	};
}

function partialCurveSegment(segment: CurveSegment, progress: number): CurveSegment {
	const boundedProgress = clamp(progress, 0, 1);
	const first = curvePointBetween(segment.from, segment.control1, boundedProgress);
	const second = curvePointBetween(segment.control1, segment.control2, boundedProgress);
	const third = curvePointBetween(segment.control2, segment.to, boundedProgress);
	const firstMiddle = curvePointBetween(first, second, boundedProgress);
	const secondMiddle = curvePointBetween(second, third, boundedProgress);
	return {
		control1: first,
		control2: firstMiddle,
		from: segment.from,
		to: curvePointBetween(firstMiddle, secondMiddle, boundedProgress),
	};
}

function curvePathCommand(segment: CurveSegment): string {
	return `C ${pathCoordinate(segment.control1.x)} ${pathCoordinate(segment.control1.y)} ${pathCoordinate(segment.control2.x)} ${pathCoordinate(segment.control2.y)} ${pathCoordinate(segment.to.x)} ${pathCoordinate(segment.to.y)}`;
}

function mapCoordinateTangents(
	course: WorkoutCourse,
	coordinate: (point: WorkoutRoutePoint) => number
): number[] {
	const { points } = course;
	const lastIndex = points.length - 1;
	const [first, wrappedNext] = points;
	const last = points[lastIndex];
	const closed = first && last && first.x === last.x && first.y === last.y;
	return points.map((point, index) => {
		if (closed && (index === 0 || index === lastIndex)) {
			const previous = points[lastIndex - 1];
			if (!(previous && wrappedNext)) {
				return 0;
			}
			const wrappedPreviousDistance = previous.distance - course.distance;
			return (
				(coordinate(wrappedNext) - coordinate(previous)) /
				(wrappedNext.distance - wrappedPreviousDistance)
			);
		}
		const previous = points[index - 1];
		const next = points[index + 1];
		if (previous && next) {
			return (coordinate(next) - coordinate(previous)) / (next.distance - previous.distance);
		}
		const neighbor = previous ?? next;
		if (!neighbor || neighbor.distance === point.distance) {
			return 0;
		}
		return (coordinate(neighbor) - coordinate(point)) / (neighbor.distance - point.distance);
	});
}

function workoutMapCourse(course: WorkoutCourse): WorkoutCourse {
	if (course.routeType !== WORKOUT_ROUTE_TYPE.OUT_AND_BACK) {
		return course;
	}
	const turnaroundDistance = course.distance / 2;
	return {
		...course,
		distance: turnaroundDistance,
		points: course.points.filter(
			(point) => point.distance <= turnaroundDistance + ROUTE_VALUE_EPSILON
		),
	};
}

function workoutMapDistance(course: WorkoutCourse, distance: number): number {
	const position = coursePosition(course, distance);
	return course.routeType === WORKOUT_ROUTE_TYPE.OUT_AND_BACK && position > course.distance / 2
		? course.distance - position
		: position;
}

function workoutMapSegments(course: WorkoutCourse): MapCurveSegment[] {
	const mapCourse = workoutMapCourse(course);
	const xTangents = mapCoordinateTangents(mapCourse, (point) => point.x);
	const yTangents = mapCoordinateTangents(mapCourse, (point) => point.y);
	const tension = 0.75;
	return mapCourse.points.slice(0, -1).flatMap((from, index) => {
		const to = mapCourse.points[index + 1];
		if (!to) {
			return [];
		}
		const controlDistance = ((to.distance - from.distance) / 3) * tension;
		return [
			{
				control1: {
					x: from.x + (xTangents[index] ?? 0) * controlDistance,
					y: from.y + (yTangents[index] ?? 0) * controlDistance,
				},
				control2: {
					x: to.x - (xTangents[index + 1] ?? 0) * controlDistance,
					y: to.y - (yTangents[index + 1] ?? 0) * controlDistance,
				},
				endDistance: to.distance,
				from: { x: from.x, y: from.y },
				startDistance: from.distance,
				to: { x: to.x, y: to.y },
			},
		];
	});
}

function workoutMapPosition(course: WorkoutCourse, distance: number): CurvePoint {
	const position = workoutMapDistance(course, distance);
	const segments = workoutMapSegments(course);
	const segment =
		segments.find((candidate) => candidate.endDistance >= position) ?? segments.at(-1);
	if (!segment) {
		const [first] = course.points;
		return first ? { x: first.x, y: first.y } : { x: 50, y: 50 };
	}
	const segmentDistance = segment.endDistance - segment.startDistance;
	const progress =
		segmentDistance > 0 ? clamp((position - segment.startDistance) / segmentDistance, 0, 1) : 0;
	return curvePointAtProgress(segment, progress);
}

function workoutProfilePoints(course: WorkoutCourse): CurvePoint[] {
	const elevations = course.points.map((point) => point.elevation);
	const minimum = Math.min(...elevations);
	const maximum = Math.max(...elevations);
	const span = Math.max(maximum - minimum, PROFILE_REFERENCE_ELEVATION_SPAN_METERS);
	return course.points.map((point) => ({
		x: (point.distance / course.distance) * 100,
		y: 88 - ((point.elevation - minimum) / span) * 72,
	}));
}

function curveTangents(points: CurvePoint[]): number[] {
	const slopes = points.slice(0, -1).map((point, index) => {
		const next = points[index + 1];
		return next ? (next.y - point.y) / (next.x - point.x) : 0;
	});
	return points.map((_point, index) => {
		const before = slopes[index - 1];
		const after = slopes[index];
		if (before === undefined) {
			return after ?? 0;
		}
		if (after === undefined) {
			return before;
		}
		if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) {
			return 0;
		}
		return (2 * before * after) / (before + after);
	});
}

function curveSegments(points: CurvePoint[]): CurveSegment[] {
	const tangents = curveTangents(points);
	return points.slice(0, -1).flatMap((from, index) => {
		const to = points[index + 1];
		if (!to) {
			return [];
		}
		const third = (to.x - from.x) / 3;
		return [
			{
				control1: { x: from.x + third, y: from.y + (tangents[index] ?? 0) * third },
				control2: {
					x: to.x - third,
					y: to.y - (tangents[index + 1] ?? 0) * third,
				},
				from,
				to,
			},
		];
	});
}

function cubicValue(start: number, control1: number, control2: number, end: number, t: number) {
	const inverse = 1 - t;
	return (
		inverse ** 3 * start +
		3 * inverse ** 2 * t * control1 +
		3 * inverse * t ** 2 * control2 +
		t ** 3 * end
	);
}

function curveValueAtX(points: CurvePoint[], x: number): number {
	const segments = curveSegments(points);
	const segment = segments.find((candidate) => candidate.to.x >= x) ?? segments.at(-1);
	if (!segment) {
		return points[0].y;
	}
	const segmentWidth = segment.to.x - segment.from.x;
	const progress = segmentWidth > 0 ? clamp((x - segment.from.x) / segmentWidth, 0, 1) : 0;
	return cubicValue(
		segment.from.y,
		segment.control1.y,
		segment.control2.y,
		segment.to.y,
		progress
	);
}

function workoutProfileSegments(course: WorkoutCourse): CurveSegment[] {
	return curveSegments(workoutProfilePoints(course));
}

export function workoutProfilePath(course: WorkoutCourse): string {
	const [first] = workoutProfilePoints(course);
	if (!first) {
		return '';
	}
	const curves = workoutProfileSegments(course).map((segment) => curvePathCommand(segment));
	return [`M ${pathCoordinate(first.x)} ${pathCoordinate(first.y)}`, ...curves].join(' ');
}
export function workoutProfilePosition(
	course: WorkoutCourse,
	terrain: WorkoutTerrain
): { x: number; y: number } {
	const x = terrain.progress * 100;
	return {
		x,
		y: curveValueAtX(workoutProfilePoints(course), x),
	};
}

interface RestoredRoutePoint extends RoutePoint {
	latitude?: number;
	longitude?: number;
	x?: number;
	y?: number;
}

function restoredPoint(value: unknown): RestoredRoutePoint | undefined {
	if (!isRecord(value)) {
		return;
	}
	const { distance, elevation, latitude, longitude, x, y } = value;
	if (!(isFiniteNumber(distance) && isFiniteNumber(elevation) && distance >= 0)) {
		return;
	}
	const geographic =
		isFiniteNumber(latitude) &&
		isFiniteNumber(longitude) &&
		latitude >= -90 &&
		latitude <= 90 &&
		longitude >= -180 &&
		longitude <= 180;
	const legacyMap =
		isFiniteNumber(x) &&
		isFiniteNumber(y) &&
		x >= MAP_MINIMUM &&
		x <= MAP_MAXIMUM &&
		y >= MAP_MINIMUM &&
		y <= MAP_MAXIMUM;
	if (!(geographic || legacyMap)) {
		return;
	}
	return {
		distance,
		elevation,
		latitude: geographic ? latitude : undefined,
		longitude: geographic ? longitude : undefined,
		x: legacyMap ? x : undefined,
		y: legacyMap ? y : undefined,
	};
}

function geographicPoints(
	points: RestoredRoutePoint[],
	distance: number
): GeographicRoutePoint[] | undefined {
	if (
		points.every((point) => isFiniteNumber(point.latitude) && isFiniteNumber(point.longitude))
	) {
		return points.map((point) => ({
			distance: point.distance,
			elevation: point.elevation,
			latitude: point.latitude ?? 0,
			longitude: point.longitude ?? 0,
		}));
	}
	if (points.every((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y))) {
		return geographicPointsForMap(
			distance,
			points.map((point) => ({
				distance: point.distance,
				elevation: point.elevation,
				x: point.x ?? 0,
				y: point.y ?? 0,
			}))
		);
	}
}

function isValidClosedCourse(points: GeographicRoutePoint[], distance: number): boolean {
	const [first] = points;
	const last = points.at(-1);
	if (!(first && last)) {
		return false;
	}
	const distancesIncrease = points.every((point, index) => {
		const previous = points[index - 1];
		return !previous || point.distance > previous.distance;
	});
	return (
		distancesIncrease &&
		approximatelyEqual(first.distance, 0) &&
		approximatelyEqual(last.distance, distance) &&
		Math.abs(first.elevation - last.elevation) <= COURSE_ELEVATION_TOLERANCE_METERS &&
		workoutRouteCloses(points)
	);
}

function isValidOutAndBack(points: GeographicRoutePoint[], distance: number): boolean {
	if (!(isValidClosedCourse(points, distance) && points.length % 2 === 1)) {
		return false;
	}
	return points.every((point, index) => {
		const mirrored = points.at(-(index + 1));
		return Boolean(
			mirrored &&
				approximatelyEqual(point.distance + mirrored.distance, distance) &&
				Math.abs(point.elevation - mirrored.elevation) <=
					OUT_AND_BACK_ELEVATION_TOLERANCE_METERS &&
				distanceBetween(
					point.latitude,
					point.longitude,
					mirrored.latitude,
					mirrored.longitude
				) <= OUT_AND_BACK_MATCH_METERS
		);
	});
}

function isValidPointToPoint(points: GeographicRoutePoint[], distance: number): boolean {
	const [first] = points;
	const last = points.at(-1);
	return Boolean(
		first &&
			last &&
			points.every((point, index) => {
				const previous = points[index - 1];
				return !previous || point.distance > previous.distance;
			}) &&
			approximatelyEqual(first.distance, 0) &&
			approximatelyEqual(last.distance, distance)
	);
}

function isValidCourse(
	points: GeographicRoutePoint[],
	distance: number,
	routeType: WorkoutRouteType
): boolean {
	switch (routeType) {
		case WORKOUT_ROUTE_TYPE.LOOP:
			return isValidClosedCourse(points, distance);
		case WORKOUT_ROUTE_TYPE.OUT_AND_BACK:
			return isValidOutAndBack(points, distance);
		case WORKOUT_ROUTE_TYPE.POINT_TO_POINT:
			return isValidPointToPoint(points, distance);
		default:
			return false;
	}
}

export function restoreWorkoutCourse(value: unknown): WorkoutCourse | undefined {
	if (!isRecord(value)) {
		return;
	}
	const {
		baseResistance,
		description,
		descriptionAttribution,
		difficulty,
		distance,
		id,
		name,
		points,
		routeType,
		startingLocation,
	} = value;
	let restoredRouteType: WorkoutRouteType | undefined;
	if (routeType === undefined) {
		restoredRouteType = WORKOUT_ROUTE_TYPE.LOOP;
	} else if (isWorkoutRouteType(routeType)) {
		restoredRouteType = routeType;
	}
	if (
		!(
			isString(description) &&
			(descriptionAttribution === undefined ||
				isWorkoutDescriptionAttribution(descriptionAttribution)) &&
			isWorkoutDifficulty(difficulty) &&
			isFiniteNumber(distance) &&
			isString(id) &&
			isString(name) &&
			Array.isArray(points) &&
			restoredRouteType &&
			(startingLocation === undefined || isString(startingLocation)) &&
			id.trim().length > 0 &&
			name.trim().length > 0 &&
			(startingLocation === undefined || startingLocation.trim().length > 0)
		)
	) {
		return;
	}
	if (points.length > MAX_SAVED_WORKOUT_POINTS) {
		return;
	}
	const restoredBaseResistance =
		baseResistance === undefined ? DEFAULT_TERRAIN_RESISTANCE : baseResistance;
	if (
		!isFiniteNumber(restoredBaseResistance) ||
		restoredBaseResistance < MIN_TERRAIN_RESISTANCE ||
		restoredBaseResistance > MAX_TERRAIN_RESISTANCE
	) {
		return;
	}
	const restoredSources = points
		.map(restoredPoint)
		.filter((point): point is RestoredRoutePoint => point !== undefined);
	const restoredPoints = geographicPoints(restoredSources, distance);
	if (
		restoredSources.length !== points.length ||
		!restoredPoints ||
		restoredPoints.length < MIN_ROUTE_POINTS ||
		distance <= 0 ||
		!isValidCourse(restoredPoints, distance, restoredRouteType)
	) {
		return;
	}
	return createGeographicCourse(
		id,
		name,
		description,
		difficulty,
		distance,
		restoredPoints,
		restoredBaseResistance,
		restoredRouteType,
		descriptionAttribution,
		startingLocation?.trim()
	);
}

export function restoreSessionWorkout(value: unknown): SessionWorkout | undefined {
	if (!isRecord(value)) {
		return;
	}
	const restoredCourse = restoreWorkoutCourse(value.course);
	if (!restoredCourse) {
		return;
	}
	return {
		course: BUILT_IN_WORKOUT_COURSES_BY_ID.get(restoredCourse.id) ?? restoredCourse,
	};
}

export function workoutDifficultyLabel(difficulty: WorkoutDifficulty): string {
	switch (difficulty) {
		case WORKOUT_DIFFICULTY.GENTLE:
			return 'Gentle';
		case WORKOUT_DIFFICULTY.MODERATE:
			return 'Moderate';
		case WORKOUT_DIFFICULTY.CHALLENGING:
			return 'Challenging';
		default:
			return difficulty;
	}
}

export function workoutMatchesSearch(course: WorkoutCourse, query: string): boolean {
	const terms = query.trim().toLocaleLowerCase().split(SEARCH_WHITESPACE).filter(Boolean);
	if (terms.length === 0) {
		return true;
	}
	const searchable =
		`${course.name} ${workoutDifficultyLabel(course.difficulty)}`.toLocaleLowerCase();
	return terms.every((term) => searchable.includes(term));
}
