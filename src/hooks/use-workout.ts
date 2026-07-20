import { useEffect, useRef } from 'react';

export function useWorkoutResistance({
	active,
	connected,
	onResistanceChange,
	onRestoreResistance,
	resistance,
}: {
	active: boolean;
	connected: boolean;
	onResistanceChange: (resistance: number) => void;
	onRestoreResistance: () => void;
	resistance?: number;
}) {
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
