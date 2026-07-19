import { useEffect, useMemo, useRef } from 'react';
import { workoutTerrainAtDistance } from '../lib/workouts';
import type { SessionWorkout, WorkoutTerrain } from '../types';

export function useWorkout({
	active,
	connected,
	distance,
	onResistanceChange,
	onRestoreResistance,
	workout,
}: {
	active: boolean;
	connected: boolean;
	distance: number;
	onResistanceChange: (resistance: number) => void;
	onRestoreResistance: () => void;
	workout?: SessionWorkout;
}): WorkoutTerrain | undefined {
	const terrain = useMemo(
		() => (workout ? workoutTerrainAtDistance(workout.course, distance) : undefined),
		[distance, workout]
	);
	const resistance = terrain?.resistance;
	const automatedResistance = useRef(false);

	useEffect(() => {
		if (active && connected && resistance !== undefined) {
			onResistanceChange(resistance);
			automatedResistance.current = true;
		} else if (
			automatedResistance.current &&
			connected &&
			(!active || resistance === undefined)
		) {
			onRestoreResistance();
			automatedResistance.current = false;
		} else if (!connected && (!active || resistance === undefined)) {
			automatedResistance.current = false;
		}
	}, [active, connected, onResistanceChange, onRestoreResistance, resistance]);

	return terrain;
}
