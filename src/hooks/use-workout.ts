import { useEffect, useRef } from 'react';
import type { WorkoutTerrain } from '../types';

export function useWorkoutResistance({
	active,
	connected,
	onResistanceChange,
	onRestoreResistance,
	terrain,
}: {
	active: boolean;
	connected: boolean;
	onResistanceChange: (resistance: number) => void;
	onRestoreResistance: () => void;
	terrain?: WorkoutTerrain;
}) {
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
}
