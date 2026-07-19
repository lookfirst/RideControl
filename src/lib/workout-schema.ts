export const WORKOUT_DIFFICULTY = {
	CHALLENGING: 'challenging',
	GENTLE: 'gentle',
	MODERATE: 'moderate',
} as const;

export type WorkoutDifficulty = (typeof WORKOUT_DIFFICULTY)[keyof typeof WORKOUT_DIFFICULTY];

const WORKOUT_DIFFICULTIES = new Set<unknown>(Object.values(WORKOUT_DIFFICULTY));

export function isWorkoutDifficulty(value: unknown): value is WorkoutDifficulty {
	return WORKOUT_DIFFICULTIES.has(value);
}

export const WORKOUT_VIEW = {
	MAP: 'map',
	PROFILE: 'profile',
} as const;

export type WorkoutView = (typeof WORKOUT_VIEW)[keyof typeof WORKOUT_VIEW];
