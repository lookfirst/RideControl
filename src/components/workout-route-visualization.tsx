import { useId } from 'react';
import { WORKOUT_VIEW, type WorkoutView } from '../lib/workout-schema';
import {
	workoutMapPath,
	workoutMapProgressPath,
	workoutProfilePath,
	workoutProfilePosition,
} from '../lib/workouts';
import type { WorkoutCourse, WorkoutTerrain } from '../types';

const ROUTE_STROKE = '#64748b';

interface RouteMarker {
	x: number;
	y: number;
}

function WorkoutRouteMarker({
	isMap,
	isRiding,
	marker,
}: {
	isMap: boolean;
	isRiding: boolean;
	marker?: RouteMarker;
}) {
	if (!marker) {
		return null;
	}
	if (isMap) {
		return (
			<g className={isRiding ? 'animate-pulse' : undefined}>
				<circle
					cx={marker.x}
					cy={marker.y}
					fill="#adf5bd"
					r="2.25"
					stroke="#12171d"
					strokeWidth="1.25"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		);
	}
	return (
		<span
			aria-hidden="true"
			className={`pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mint shadow-[0_0_0_4px_rgba(173,245,189,.18)] ${isRiding ? 'animate-pulse' : ''}`}
			data-profile-marker="true"
			style={{
				left: `clamp(0.5rem, ${marker.x}%, calc(100% - 0.5rem))`,
				top: `clamp(0.5rem, ${marker.y}%, calc(100% - 0.5rem))`,
			}}
		/>
	);
}

export function WorkoutRouteVisualization({
	className = 'h-40',
	course,
	isRiding = false,
	terrain,
	view,
}: {
	className?: string;
	course: WorkoutCourse;
	isRiding?: boolean;
	terrain?: WorkoutTerrain;
	view: WorkoutView;
}) {
	const progress = terrain ? terrain.progress * 100 : 0;
	const isMap = view === WORKOUT_VIEW.MAP;
	const path = isMap ? workoutMapPath(course) : workoutProfilePath(course);
	const progressPath = isMap && terrain ? workoutMapProgressPath(course, terrain) : path;
	const progressClipId = `workout-progress-${useId().replaceAll(':', '')}`;
	let marker: RouteMarker | undefined;
	if (terrain) {
		marker = isMap ? { x: terrain.x, y: terrain.y } : workoutProfilePosition(course, terrain);
	}
	const profileArea = `${path} L 100 92 L 0 92 Z`;

	return (
		<div className={`relative w-full ${className}`}>
			<svg
				aria-label={`${course.name} ${isMap ? 'course map' : 'elevation profile'}`}
				className="block h-full w-full"
				preserveAspectRatio="none"
				role="img"
				viewBox="0 0 100 100"
			>
				<title>{`${course.name} ${isMap ? 'course map' : 'elevation profile'}`}</title>
				{isMap ? null : (
					<defs>
						<clipPath id={progressClipId}>
							<rect height="100" width={progress} />
						</clipPath>
					</defs>
				)}
				{isMap ? null : (
					<>
						<path d={profileArea} fill="rgba(100, 116, 139, .18)" />
						<path
							d="M0 92H100"
							fill="none"
							stroke="#475569"
							strokeWidth=".75"
							vectorEffect="non-scaling-stroke"
						/>
					</>
				)}
				<path
					d={path}
					fill="none"
					stroke={ROUTE_STROKE}
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={isMap ? 5 : 3}
					vectorEffect="non-scaling-stroke"
				/>
				{terrain && progress > 0 ? (
					<path
						clipPath={isMap ? undefined : `url(#${progressClipId})`}
						d={progressPath}
						data-route-progress="true"
						fill="none"
						stroke="#adf5bd"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={isMap ? 5 : 2.5}
						vectorEffect="non-scaling-stroke"
					/>
				) : null}
				{isMap ? <WorkoutRouteMarker isMap isRiding={isRiding} marker={marker} /> : null}
			</svg>
			{isMap ? null : (
				<WorkoutRouteMarker isMap={false} isRiding={isRiding} marker={marker} />
			)}
		</div>
	);
}
