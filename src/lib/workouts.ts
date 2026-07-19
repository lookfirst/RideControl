import type {
	ElevationTotals,
	GeographicRoutePoint,
	RoutePoint,
	SessionWorkout,
	WorkoutCourse,
	WorkoutRoutePoint,
	WorkoutTerrain,
} from '../types';
import { elevationTotalsForSamples } from './elevation';
import { distanceBetween } from './gpx';
import { clamp, nonNegativeNumber } from './numbers';
import { clampResistance } from './resistance';
import { isFiniteNumber, isRecord, isString } from './type-guards';
import { isWorkoutDifficulty, WORKOUT_DIFFICULTY, type WorkoutDifficulty } from './workout-schema';

const DEFAULT_TERRAIN_RESISTANCE = 12;
const RESISTANCE_PER_GRADE_PERCENT = 2.25;
const MIN_TERRAIN_RESISTANCE = 4;
const MAX_TERRAIN_RESISTANCE = 55;
const MAX_SAVED_WORKOUT_POINTS = 200;
const MIN_ROUTE_POINTS = 3;
const MAP_MINIMUM = 0;
const MAP_MAXIMUM = 100;
const MAP_PADDING = 8;
const GENERATED_COURSE_LATITUDE = 39;
const GENERATED_COURSE_LONGITUDE = -105;
const METERS_PER_LATITUDE_DEGREE = 111_320;
const LOOP_CLOSURE_METERS = 100;
const LOOP_ELEVATION_TOLERANCE_METERS = 20;
const ROUTE_VALUE_EPSILON = 0.000_001;
export const WORKOUT_FLAT_START_DISTANCE = 1.5;

interface CourseMapPoint extends RoutePoint {
	x: number;
	y: number;
}

function approximatelyEqual(left: number, right: number): boolean {
	return Math.abs(left - right) <= ROUTE_VALUE_EPSILON;
}

function elevationGain(points: WorkoutRoutePoint[]): number {
	return elevationTotalsForSamples(points).ascent;
}

function withFlatCourseStart<T extends RoutePoint>(points: T[]): T[] {
	const startElevation = points[0]?.elevation;
	return startElevation === undefined
		? points
		: points.map((point) =>
				point.distance <= WORKOUT_FLAT_START_DISTANCE
					? { ...point, elevation: startElevation }
					: point
			);
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
	baseResistance = DEFAULT_TERRAIN_RESISTANCE
): WorkoutCourse {
	const [first] = points;
	const terrainPoints = mapCoordinates(
		withFlatCourseStart(
			first
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
				: points
		)
	);
	return {
		baseResistance,
		description,
		difficulty,
		distance,
		elevationGain: elevationGain(terrainPoints),
		id,
		name,
		points: terrainPoints,
	};
}

function createCourse(
	id: string,
	name: string,
	description: string,
	difficulty: WorkoutDifficulty,
	distance: number,
	points: CourseMapPoint[],
	baseResistance = DEFAULT_TERRAIN_RESISTANCE
): WorkoutCourse {
	return createGeographicCourse(
		id,
		name,
		description,
		difficulty,
		distance,
		geographicPointsForMap(distance, points),
		baseResistance
	);
}

export const WORKOUT_COURSES: WorkoutCourse[] = [
	createCourse(
		'harbor-ring',
		'Harbor Ring',
		'A relaxed waterfront loop with short ramps and long recovery sections.',
		WORKOUT_DIFFICULTY.GENTLE,
		6.4,
		[
			{ distance: 0, elevation: 18, x: 18, y: 40 },
			{ distance: 0.8, elevation: 18, x: 33, y: 18 },
			{ distance: 1.6, elevation: 18, x: 60, y: 12 },
			{ distance: 2.4, elevation: 28, x: 86, y: 27 },
			{ distance: 3.2, elevation: 24, x: 68, y: 45 },
			{ distance: 4, elevation: 20, x: 88, y: 70 },
			{ distance: 4.8, elevation: 25, x: 58, y: 87 },
			{ distance: 5.6, elevation: 21, x: 27, y: 78 },
			{ distance: 6.4, elevation: 18, x: 18, y: 40 },
		]
	),
	createCourse(
		'prairie-roll',
		'Prairie Roll',
		'Fifteen miles of long, gentle rollers moving from 15–25% resistance around a steady 20%.',
		WORKOUT_DIFFICULTY.GENTLE,
		24.140_16,
		[
			{ distance: 0, elevation: 30, x: 50, y: 50 },
			{ distance: 1.5, elevation: 30, x: 34, y: 17 },
			{ distance: 4, elevation: 69, x: 9, y: 29 },
			{ distance: 6.5, elevation: 30, x: 17, y: 70 },
			{ distance: 9.25, elevation: 69, x: 40, y: 87 },
			{ distance: 12, elevation: 30, x: 50, y: 50 },
			{ distance: 15, elevation: 69, x: 66, y: 15 },
			{ distance: 18, elevation: 30, x: 91, y: 31 },
			{ distance: 21, elevation: 69, x: 82, y: 75 },
			{ distance: 24.140_16, elevation: 30, x: 50, y: 50 },
		],
		20
	),
	createCourse(
		'cedar-circuit',
		'Cedar Circuit',
		'A flat rollout into constant rollers through a broad forest loop with two climbs.',
		WORKOUT_DIFFICULTY.MODERATE,
		9.6,
		[
			{ distance: 0, elevation: 46, x: 15, y: 24 },
			{ distance: 0.8, elevation: 46, x: 34, y: 12 },
			{ distance: 1.6, elevation: 46, x: 56, y: 18 },
			{ distance: 2.4, elevation: 82, x: 78, y: 10 },
			{ distance: 3.2, elevation: 58, x: 92, y: 28 },
			{ distance: 4, elevation: 91, x: 77, y: 45 },
			{ distance: 4.8, elevation: 128, x: 91, y: 68 },
			{ distance: 5.6, elevation: 101, x: 68, y: 86 },
			{ distance: 6.4, elevation: 68, x: 44, y: 78 },
			{ distance: 7.2, elevation: 84, x: 22, y: 90 },
			{ distance: 8, elevation: 63, x: 8, y: 68 },
			{ distance: 8.8, elevation: 52, x: 24, y: 50 },
			{ distance: 9.6, elevation: 46, x: 15, y: 24 },
		]
	),
	createCourse(
		'highland-loop',
		'Highland Loop',
		'A flat rollout into one long mountain ascent, a ridge, and a fast descent.',
		WORKOUT_DIFFICULTY.CHALLENGING,
		12,
		[
			{ distance: 0, elevation: 74, x: 50, y: 50 },
			{ distance: 0.75, elevation: 74, x: 61, y: 29 },
			{ distance: 1.5, elevation: 74, x: 78, y: 14 },
			{ distance: 2.25, elevation: 119, x: 91, y: 23 },
			{ distance: 3, elevation: 176, x: 92, y: 43 },
			{ distance: 3.75, elevation: 254, x: 80, y: 61 },
			{ distance: 4.5, elevation: 325, x: 64, y: 66 },
			{ distance: 5.25, elevation: 348, x: 54, y: 56 },
			{ distance: 6, elevation: 338, x: 50, y: 50 },
			{ distance: 6.75, elevation: 278, x: 43, y: 44 },
			{ distance: 7.5, elevation: 214, x: 28, y: 34 },
			{ distance: 8.25, elevation: 157, x: 11, y: 43 },
			{ distance: 9, elevation: 121, x: 8, y: 63 },
			{ distance: 9.75, elevation: 147, x: 20, y: 82 },
			{ distance: 10.5, elevation: 112, x: 39, y: 88 },
			{ distance: 11.25, elevation: 83, x: 51, y: 68 },
			{ distance: 12, elevation: 74, x: 50, y: 50 },
		]
	),
];

function loopDistance(courseDistance: number, totalDistance: number): number {
	if (courseDistance <= 0) {
		return 0;
	}
	return nonNegativeNumber(totalDistance) % courseDistance;
}

function segmentAtDistance(course: WorkoutCourse, distance: number) {
	const position = loopDistance(course.distance, distance);
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
	return course.distance <= 0
		? 0
		: loopDistance(course.distance, totalDistance) / course.distance;
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
	return workoutCompletedLaps(course, totalDistance) + 1;
}

export function workoutCompletedLaps(course: WorkoutCourse, totalDistance: number): number {
	return course.distance <= 0
		? 0
		: Math.floor(nonNegativeNumber(totalDistance) / course.distance);
}

export function workoutElevationTotalsAtDistance(
	course: WorkoutCourse,
	totalDistance: number
): ElevationTotals {
	const completedLaps = workoutCompletedLaps(course, totalDistance);
	const fullLap = elevationTotalsForSamples(course.points);
	const position = loopDistance(course.distance, totalDistance);
	const current = coursePointAtDistance(course, position);
	const partialLap = elevationTotalsForSamples([
		...course.points.filter((point) => point.distance < position),
		current,
	]);
	return {
		ascent: fullLap.ascent * completedLaps + partialLap.ascent,
		descent: fullLap.descent * completedLaps + partialLap.descent,
	};
}

export function workoutMaximumGrade(course: WorkoutCourse): number {
	return course.points.reduce((maximum, point, index) => {
		const previous = course.points[index - 1];
		if (!previous || point.distance <= previous.distance) {
			return maximum;
		}
		const grade =
			((point.elevation - previous.elevation) /
				((point.distance - previous.distance) * 1000)) *
			100;
		return Math.max(maximum, grade);
	}, 0);
}

export function workoutTerrainAtDistance(
	course: WorkoutCourse,
	totalDistance: number
): WorkoutTerrain {
	const distance = loopDistance(course.distance, totalDistance);
	const point = coursePointAtDistance(course, distance);
	const lookAheadDistance = Math.min(0.15, course.distance / 20);
	const ahead = coursePointAtDistance(course, distance + lookAheadDistance);
	const grade =
		lookAheadDistance > 0
			? clamp(
					((ahead.elevation - point.elevation) / (lookAheadDistance * 1000)) * 100,
					-15,
					15
				)
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
	const curves: string[] = [];
	for (const segment of workoutMapSegments(course)) {
		if (segment.endDistance <= terrain.distance) {
			curves.push(curvePathCommand(segment));
			continue;
		}
		if (segment.startDistance < terrain.distance) {
			const progress =
				(terrain.distance - segment.startDistance) /
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

function workoutMapSegments(course: WorkoutCourse): MapCurveSegment[] {
	const xTangents = mapCoordinateTangents(course, (point) => point.x);
	const yTangents = mapCoordinateTangents(course, (point) => point.y);
	const tension = 0.75;
	return course.points.slice(0, -1).flatMap((from, index) => {
		const to = course.points[index + 1];
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
	const position = loopDistance(course.distance, distance);
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
	const span = maximum - minimum || 1;
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

function isValidLoop(points: GeographicRoutePoint[], distance: number): boolean {
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
		Math.abs(first.elevation - last.elevation) <= LOOP_ELEVATION_TOLERANCE_METERS &&
		distanceBetween(first.latitude, first.longitude, last.latitude, last.longitude) <=
			LOOP_CLOSURE_METERS
	);
}

export function restoreWorkoutCourse(value: unknown): WorkoutCourse | undefined {
	if (!isRecord(value)) {
		return;
	}
	const { baseResistance, description, difficulty, distance, id, name, points } = value;
	if (
		!(
			isString(description) &&
			isWorkoutDifficulty(difficulty) &&
			isFiniteNumber(distance) &&
			isString(id) &&
			isString(name) &&
			Array.isArray(points) &&
			id.trim().length > 0 &&
			name.trim().length > 0
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
		!isValidLoop(restoredPoints, distance)
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
		restoredBaseResistance
	);
}

export function restoreSessionWorkout(value: unknown): SessionWorkout | undefined {
	if (!isRecord(value)) {
		return;
	}
	const restoredCourse = restoreWorkoutCourse(value.course);
	return restoredCourse ? { course: restoredCourse } : undefined;
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
