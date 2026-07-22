export const CONTROL_MODE = {
	GEAR: 'gear',
	RESISTANCE: 'resistance',
} as const;

export type ControlMode = (typeof CONTROL_MODE)[keyof typeof CONTROL_MODE];

const CONTROL_MODES = new Set<unknown>(Object.values(CONTROL_MODE));

export function isControlMode(value: unknown): value is ControlMode {
	return CONTROL_MODES.has(value);
}

export function trainingControlMode(clickPaired: boolean, workoutSelected: boolean): ControlMode {
	return clickPaired || workoutSelected ? CONTROL_MODE.GEAR : CONTROL_MODE.RESISTANCE;
}

export function virtualShiftingConnectionReady({
	trainerConnected,
}: {
	clickConnectedCount: number;
	clickPairedCount: number;
	trainerConnected: boolean;
}): boolean {
	return trainerConnected;
}
