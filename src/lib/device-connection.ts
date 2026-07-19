export type DeviceConnectionPhase =
	| 'unpaired'
	| 'pairing'
	| 'connecting'
	| 'reconnecting'
	| 'connected'
	| 'offline';

export interface DeviceConnectionView {
	busy: boolean;
	connected: boolean;
	paired: boolean;
	phase: DeviceConnectionPhase;
	reconnecting: boolean;
	status: string;
}

const STATUS_BY_PHASE: Record<DeviceConnectionPhase, string> = {
	connected: 'Connected',
	connecting: 'Connecting…',
	offline: 'Paired · offline',
	pairing: 'Pairing…',
	reconnecting: 'Reconnecting…',
	unpaired: 'Not paired',
};

export function deviceConnectionView(phase: DeviceConnectionPhase): DeviceConnectionView {
	return {
		busy: phase === 'pairing' || phase === 'connecting' || phase === 'reconnecting',
		connected: phase === 'connected',
		paired: phase !== 'unpaired' && phase !== 'pairing',
		phase,
		reconnecting: phase === 'reconnecting',
		status: STATUS_BY_PHASE[phase],
	};
}

export function aggregateConnectionPhase(
	phases: readonly DeviceConnectionPhase[]
): DeviceConnectionPhase {
	if (!phases.length) {
		return 'unpaired';
	}
	if (phases.every((phase) => phase === 'connected')) {
		return 'connected';
	}
	if (phases.some((phase) => phase === 'reconnecting')) {
		return 'reconnecting';
	}
	if (phases.some((phase) => phase === 'connecting')) {
		return 'connecting';
	}
	return 'offline';
}

export function setConnectionPhase(
	phases: Readonly<Record<string, DeviceConnectionPhase>>,
	deviceId: string,
	phase: DeviceConnectionPhase
): Record<string, DeviceConnectionPhase> {
	if (phases[deviceId] === phase) {
		return phases;
	}
	return { ...phases, [deviceId]: phase };
}

export function removeConnectionPhase(
	phases: Readonly<Record<string, DeviceConnectionPhase>>,
	deviceId: string
): Record<string, DeviceConnectionPhase> {
	if (!(deviceId in phases)) {
		return phases;
	}
	const next = { ...phases };
	delete next[deviceId];
	return next;
}
