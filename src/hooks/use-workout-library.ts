import { useCallback, useMemo, useRef, useState } from 'react';
import {
	addCustomWorkout,
	loadCustomWorkouts,
	readWorkoutFile,
	saveCustomWorkouts,
	withoutCustomWorkout,
} from '../lib/workout-file';
import { WORKOUT_COURSES } from '../lib/workouts';
import type { WorkoutCourse } from '../types';

export function useWorkoutLibrary() {
	const [customCourses, setCustomCourses] = useState(loadCustomWorkouts);
	const customCoursesRef = useRef(customCourses);
	const courses = useMemo(() => [...WORKOUT_COURSES, ...customCourses], [customCourses]);
	const customCourseIds = useMemo(
		() => new Set(customCourses.map((course) => course.id)),
		[customCourses]
	);

	const replaceCustomCourses = useCallback((next: WorkoutCourse[]) => {
		saveCustomWorkouts(next);
		customCoursesRef.current = next;
		setCustomCourses(next);
	}, []);

	const importFile = useCallback(
		async (file: File) => {
			const course = await readWorkoutFile(file);
			const result = addCustomWorkout(customCoursesRef.current, course);
			replaceCustomCourses(result.courses);
			return result.course;
		},
		[replaceCustomCourses]
	);

	const removeCourse = useCallback(
		(courseId: string) => {
			replaceCustomCourses(withoutCustomWorkout(customCoursesRef.current, courseId));
		},
		[replaceCustomCourses]
	);

	return {
		courses,
		customCourseIds,
		importFile,
		removeCourse,
	};
}
