import type { WorkoutCourse } from '../types';

export function workoutMaximumGrade(course: Pick<WorkoutCourse, 'points'>): number {
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
