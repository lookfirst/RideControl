import type { SessionWorkout, WorkoutCourse } from '../types';
import { isRecord, isString } from './type-guards';
import { restoreWorkoutCourse } from './workouts';

const SNAPSHOT_ID_PREFIX = 'session-workout:';
const FNV_PRIME = 16_777_619;
const FNV_OFFSET_BASIS = 2_166_136_261;
const SECOND_HASH_SEED = 3_332_611_411;

export interface SessionWorkoutSnapshot {
	id: string;
	workout: SessionWorkout;
}

function hashSource(source: string, seed: number): string {
	let hash = seed;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function workoutSnapshotSource(course: WorkoutCourse): string {
	return JSON.stringify({
		baseResistance: course.baseResistance,
		description: course.description,
		descriptionAttribution: course.descriptionAttribution ?? null,
		difficulty: course.difficulty,
		distance: course.distance,
		elevationGain: course.elevationGain,
		id: course.id,
		name: course.name,
		points: course.points.map((point) => [
			point.distance,
			point.elevation,
			point.latitude,
			point.longitude,
			point.x,
			point.y,
		]),
		routeType: course.routeType,
		startingLocation: course.startingLocation ?? null,
	});
}

export function createSessionWorkoutSnapshot(
	workout: SessionWorkout | undefined
): SessionWorkoutSnapshot | undefined {
	if (!workout) {
		return;
	}
	const source = workoutSnapshotSource(workout.course);
	return {
		id: `${SNAPSHOT_ID_PREFIX}${hashSource(source, FNV_OFFSET_BASIS)}${hashSource(source, SECOND_HASH_SEED)}-${source.length}`,
		workout,
	};
}

export function restoreSnapshotWorkout(value: unknown): SessionWorkout | undefined {
	if (!isRecord(value)) {
		return;
	}
	const course = restoreWorkoutCourse(value.course);
	return course ? { course } : undefined;
}

export function restoreSessionWorkoutSnapshot(value: unknown): SessionWorkoutSnapshot | undefined {
	if (!(isRecord(value) && isString(value.id))) {
		return;
	}
	const workout = restoreSnapshotWorkout(value.workout);
	return value.id.startsWith(SNAPSHOT_ID_PREFIX) && workout
		? { id: value.id, workout }
		: undefined;
}
