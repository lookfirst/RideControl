import { createStore } from '@tanstack/react-store';
import {
	type DeviceConnectionPhase,
	removeConnectionPhase,
	setConnectionPhase,
} from '../lib/device-connection';
import type { ClickControllerRoles } from '../lib/zwift-click';

export interface ZwiftClickStoreState {
	activeControllerIds: string[];
	controllerPhases: Record<string, DeviceConnectionPhase>;
	controllerRoles: ClickControllerRoles;
	deviceIds: string[];
	pairing: boolean;
}

export function createZwiftClickStore() {
	return createStore(
		{
			activeControllerIds: [],
			controllerPhases: {},
			controllerRoles: {},
			deviceIds: [],
			pairing: false,
		} as ZwiftClickStoreState,
		({ setState }) => ({
			activateController: (deviceId: string) => {
				setState((current) =>
					current.activeControllerIds.includes(deviceId)
						? current
						: {
								...current,
								activeControllerIds: [...current.activeControllerIds, deviceId],
							}
				);
			},
			clearActiveControllers: () => {
				setState((current) =>
					current.activeControllerIds.length
						? { ...current, activeControllerIds: [] }
						: current
				);
			},
			deactivateController: (deviceId: string) => {
				setState((current) => ({
					...current,
					activeControllerIds: current.activeControllerIds.filter(
						(id) => id !== deviceId
					),
				}));
			},
			removeControllerPhase: (deviceId: string) => {
				setState((current) => ({
					...current,
					controllerPhases: removeConnectionPhase(current.controllerPhases, deviceId),
				}));
			},
			setControllerPhase: (deviceId: string, phase: DeviceConnectionPhase) => {
				setState((current) => ({
					...current,
					controllerPhases: setConnectionPhase(current.controllerPhases, deviceId, phase),
				}));
			},
			setControllerPhases: (controllerPhases: Record<string, DeviceConnectionPhase>) => {
				setState((current) => ({ ...current, controllerPhases }));
			},
			setControllerRoles: (controllerRoles: ClickControllerRoles) => {
				setState((current) => ({ ...current, controllerRoles }));
			},
			setDeviceIds: (deviceIds: string[]) => {
				setState((current) => ({ ...current, deviceIds }));
			},
			setPairing: (pairing: boolean) => {
				setState((current) => ({ ...current, pairing }));
			},
		})
	);
}

export type ZwiftClickStore = ReturnType<typeof createZwiftClickStore>;
