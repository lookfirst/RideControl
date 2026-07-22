import { createStore } from '@tanstack/react-store';
import {
	type DeviceConnectionPhase,
	removeConnectionPhase,
	setConnectionPhase,
} from '../lib/device-connection';
import type {
	ClickControllerDetails,
	ClickControllerDetailsByRole,
	ClickControllerDeviceIds,
	ClickShift,
} from '../lib/zwift-click';

export interface ZwiftClickStoreState {
	activeControllerShifts: Partial<Record<ClickShift, ClickShift>>;
	controllerDetails: ClickControllerDetailsByRole;
	controllerIds: ClickControllerDeviceIds;
	controllerPhases: Partial<Record<ClickShift, DeviceConnectionPhase>>;
	pairingRole?: ClickShift;
}

export function createZwiftClickStore() {
	return createStore(
		{
			activeControllerShifts: {},
			controllerDetails: {},
			controllerIds: {},
			controllerPhases: {},
			pairingRole: undefined,
		} as ZwiftClickStoreState,
		({ setState }) => ({
			activateController: (role: ClickShift, shift: ClickShift) => {
				setState((current) =>
					current.activeControllerShifts[role] === shift
						? current
						: {
								...current,
								activeControllerShifts: {
									...current.activeControllerShifts,
									[role]: shift,
								},
							}
				);
			},
			clearActiveControllers: () => {
				setState((current) =>
					Object.keys(current.activeControllerShifts).length
						? { ...current, activeControllerShifts: {} }
						: current
				);
			},
			deactivateController: (role: ClickShift) => {
				setState((current) => {
					if (!current.activeControllerShifts[role]) {
						return current;
					}
					const activeControllerShifts = { ...current.activeControllerShifts };
					delete activeControllerShifts[role];
					return { ...current, activeControllerShifts };
				});
			},
			removeController: (role: ClickShift) => {
				setState((current) => {
					const activeControllerShifts = { ...current.activeControllerShifts };
					const controllerDetails = { ...current.controllerDetails };
					const controllerIds = { ...current.controllerIds };
					delete activeControllerShifts[role];
					delete controllerDetails[role];
					delete controllerIds[role];
					return {
						...current,
						activeControllerShifts,
						controllerDetails,
						controllerIds,
						controllerPhases: removeConnectionPhase(current.controllerPhases, role),
					};
				});
			},
			setController: (role: ClickShift, deviceId: string) => {
				setState((current) =>
					current.controllerIds[role] === deviceId
						? current
						: {
								...current,
								controllerIds: { ...current.controllerIds, [role]: deviceId },
							}
				);
			},
			setControllerDetails: (role: ClickShift, details: ClickControllerDetails) => {
				setState((current) => ({
					...current,
					controllerDetails: {
						...current.controllerDetails,
						[role]: { ...current.controllerDetails[role], ...details },
					},
				}));
			},
			setControllerDetailsByRole: (controllerDetails: ClickControllerDetailsByRole) => {
				setState((current) => ({ ...current, controllerDetails }));
			},
			setControllerPhase: (role: ClickShift, phase: DeviceConnectionPhase) => {
				setState((current) => {
					const controllerPhases = setConnectionPhase(
						current.controllerPhases,
						role,
						phase
					);
					return controllerPhases === current.controllerPhases
						? current
						: { ...current, controllerPhases };
				});
			},
			setControllerPhases: (
				controllerPhases: Partial<Record<ClickShift, DeviceConnectionPhase>>
			) => {
				setState((current) => ({ ...current, controllerPhases }));
			},
			setControllers: (controllerIds: ClickControllerDeviceIds) => {
				setState((current) => ({ ...current, controllerIds }));
			},
			setPairingRole: (pairingRole?: ClickShift) => {
				setState((current) => ({ ...current, pairingRole }));
			},
		})
	);
}

export type ZwiftClickStore = ReturnType<typeof createZwiftClickStore>;
