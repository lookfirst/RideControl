import { useCallback, useMemo, useRef, useState } from 'react';
import {
	addCustomWorkout,
	loadCustomWorkouts,
	loadWorkoutOrder,
	moveWorkoutCourse,
	orderWorkoutCourses,
	prioritizeWorkoutCourse,
	readWorkoutFile,
	renameCustomWorkout,
	saveCustomWorkouts,
	saveWorkoutOrder,
	withoutCustomWorkout,
} from '../lib/workout-file';
import { WORKOUT_COURSES } from '../lib/workouts';
import type { WorkoutCourse } from '../types';

export function useWorkoutLibrary() {
	const [customCourses, setCustomCourses] = useState(loadCustomWorkouts);
	const [courseOrder, setCourseOrder] = useState(loadWorkoutOrder);
	const customCoursesRef = useRef(customCourses);
	const courses = useMemo(
		() => orderWorkoutCourses([...WORKOUT_COURSES, ...customCourses], courseOrder),
		[courseOrder, customCourses]
	);
	const coursesRef = useRef(courses);
	coursesRef.current = courses;
	const customCourseIds = useMemo(
		() => new Set(customCourses.map((course) => course.id)),
		[customCourses]
	);

	const replaceCustomCourses = useCallback((next: WorkoutCourse[]) => {
		saveCustomWorkouts(next);
		customCoursesRef.current = next;
		setCustomCourses(next);
	}, []);
	const replaceCourseOrder = useCallback((next: string[]) => {
		saveWorkoutOrder(next);
		setCourseOrder(next);
	}, []);
	const importCourse = useCallback(
		(course: WorkoutCourse) => {
			const result = addCustomWorkout(customCoursesRef.current, course);
			const nextCourses = prioritizeWorkoutCourse(
				[...WORKOUT_COURSES, ...result.courses],
				coursesRef.current.map((currentCourse) => currentCourse.id),
				result.course.id
			);
			replaceCustomCourses(result.courses);
			replaceCourseOrder(nextCourses.map((nextCourse) => nextCourse.id));
			return result.course;
		},
		[replaceCourseOrder, replaceCustomCourses]
	);

	const importFile = useCallback(
		async (file: File) => {
			const course = await readWorkoutFile(file);
			return importCourse(course);
		},
		[importCourse]
	);

	const removeCourse = useCallback(
		(courseId: string) => {
			replaceCustomCourses(withoutCustomWorkout(customCoursesRef.current, courseId));
		},
		[replaceCustomCourses]
	);
	const renameCourse = useCallback(
		(courseId: string, name: string) => {
			const result = renameCustomWorkout(customCoursesRef.current, courseId, name);
			replaceCustomCourses(result.courses);
			return result.course;
		},
		[replaceCustomCourses]
	);
	const reorderCourse = useCallback(
		(movedCourseId: string, destinationIndex: number) => {
			const reordered = moveWorkoutCourse(
				coursesRef.current,
				movedCourseId,
				destinationIndex
			);
			if (reordered === coursesRef.current) {
				return;
			}
			replaceCourseOrder(reordered.map((course) => course.id));
		},
		[replaceCourseOrder]
	);

	return {
		courses,
		customCourseIds,
		importCourse,
		importFile,
		removeCourse,
		renameCourse,
		reorderCourse,
	};
}
