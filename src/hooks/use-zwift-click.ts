import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { WEB_BLUETOOTH_UNAVAILABLE_MESSAGE } from '../constants';
import { isBluetoothChooserCancellation } from '../lib/bluetooth';
import {
	createBluetoothReconnectController,
	reconnectBluetoothDevicesNow,
	scheduleBluetoothDeviceReconnect,
} from '../lib/bluetooth-reconnect';
import {
	aggregateConnectionPhase,
	connectedDeviceCount,
	deviceConnectionView,
} from '../lib/device-connection';
import { errorMessage } from '../lib/errors';
import {
	type RememberedBluetoothDeviceCatalog,
	rememberedBluetoothDevice,
} from '../lib/remembered-bluetooth-devices';
import {
	abortPendingClickConnectionOnAdvertisement,
	CLICK_CONTROLLER_DETAILS_STORAGE_KEY,
	CLICK_CONTROLLER_DEVICES_STORAGE_KEY,
	CLICK_CONTROLLER_ORDER,
	type ClickControllerDetails,
	type ClickControllerDetailsByRole,
	type ClickControllerDeviceIds,
	type ClickShift,
	clickControllerLabel,
	clickControllerRequestOptions,
	clickControllerRoleFromManufacturerData,
	shouldMaintainClickConnection,
	storedClickControllerDetails,
	storedClickControllerDeviceIds,
} from '../lib/zwift-click';
import {
	type ClickDeviceConnection,
	connectClickDevice,
	inspectClickDeviceDetails,
	SupersededClickConnectionError,
} from '../lib/zwift-click-device';
import { createZwiftClickStore } from '../stores/zwift-click-store';
import { usePageHide } from './use-page-hide';
import { useZwiftClickInput } from './use-zwift-click-input';

interface ClickConnectionOptions {
	rediscover?: boolean;
	scheduleRetry?: boolean;
}

function saveControllerIds(controllerIds: ClickControllerDeviceIds) {
	localStorage.setItem(CLICK_CONTROLLER_DEVICES_STORAGE_KEY, JSON.stringify(controllerIds));
}

function saveControllerDetails(controllerDetails: ClickControllerDetailsByRole) {
	localStorage.setItem(CLICK_CONTROLLER_DETAILS_STORAGE_KEY, JSON.stringify(controllerDetails));
}

function roleForDevice(
	devices: ReadonlyMap<ClickShift, BluetoothDevice>,
	deviceId: string
): ClickShift | undefined {
	for (const [role, device] of devices) {
		if (device.id === deviceId) {
			return role;
		}
	}
}

function rememberedClickControllerState(
	catalogDevices: readonly BluetoothDevice[],
	storedControllerIds: ClickControllerDeviceIds,
	storedControllerDetailsByRole: ClickControllerDetailsByRole
) {
	const devices = new Map<ClickShift, BluetoothDevice>();
	const controllerDetails: ClickControllerDetailsByRole = {};
	const controllerIds: ClickControllerDeviceIds = {};
	for (const role of CLICK_CONTROLLER_ORDER) {
		const deviceId = storedControllerIds[role];
		if (!deviceId) {
			continue;
		}
		const device = rememberedBluetoothDevice(catalogDevices, deviceId);
		if (!device) {
			continue;
		}
		devices.set(role, device);
		controllerIds[role] = device.id;
		if (storedControllerDetailsByRole[role]) {
			controllerDetails[role] = storedControllerDetailsByRole[role];
		}
	}
	return { controllerDetails, controllerIds, devices };
}

export function useZwiftClick(
	onShift: (change: number) => void,
	setNotice: (notice: string) => void,
	identifyControllers: boolean,
	rememberedDeviceCatalog: RememberedBluetoothDeviceCatalog
) {
	const store = useMemo(() => createZwiftClickStore(), []);
	const state = useSelector(store);
	const { setControllerPhase } = store.actions;
	const autoReconnect = useRef(true);
	const connectingRoles = useRef(new Set<ClickShift>());
	const connectionAttempts = useRef(new Map<ClickShift, number>());
	const connectionActive = useRef(false);
	const connections = useRef(new Map<ClickShift, ClickDeviceConnection>());
	const devicesRef = useRef(new Map<ClickShift, BluetoothDevice>());
	const forgottenIds = useRef(new Set<string>());
	const reportedConnectionFailures = useRef(new Set<string>());
	const handleReconnectAdvertisement = useRef<
		((selected: BluetoothDevice, event: BluetoothAdvertisingEvent) => void) | undefined
	>(undefined);
	const connectDeviceRef = useRef<
		| ((
				selected: BluetoothDevice,
				role: ClickShift,
				options?: ClickConnectionOptions
		  ) => Promise<boolean>)
		| undefined
	>(undefined);
	const operationalRoles = useRef(new Set<ClickShift>());
	const reconnectController = useRef(
		createBluetoothReconnectController<BluetoothDevice>({
			attempt: (selected) => {
				const role = roleForDevice(devicesRef.current, selected.id);
				return role
					? (connectDeviceRef.current?.(selected, role, {
							rediscover: true,
							scheduleRetry: false,
						}) ?? Promise.resolve(false))
					: Promise.resolve(false);
			},
			canRetry: (selected) =>
				shouldMaintainClickConnection(
					autoReconnect.current,
					connectionActive.current,
					forgottenIds.current.has(selected.id)
				),
			onAdvertisement: (selected, event) =>
				handleReconnectAdvertisement.current?.(selected, event),
			onWaiting: (selected) => {
				const role = roleForDevice(devicesRef.current, selected.id);
				if (role) {
					store.actions.setControllerPhase(role, 'reconnecting');
				}
			},
		})
	);

	const updateControllerDetails = useCallback(
		(role: ClickShift, details: ClickControllerDetails) => {
			if (!Object.keys(details).length) {
				return;
			}
			const nextDetails = {
				...store.get().controllerDetails,
				[role]: { ...store.get().controllerDetails[role], ...details },
			};
			store.actions.setControllerDetails(role, details);
			saveControllerDetails(nextDetails);
		},
		[store]
	);

	const markControllerOperational = useCallback(
		(role: ClickShift) => {
			if (!connectionActive.current) {
				return;
			}
			const selected = devicesRef.current.get(role);
			if (!selected) {
				return;
			}
			operationalRoles.current.add(role);
			reconnectController.current.reset(selected.id);
			reportedConnectionFailures.current.delete(selected.id);
			setControllerPhase(role, 'connected');
		},
		[setControllerPhase]
	);
	const clickInput = useZwiftClickInput({
		identifyControllers,
		onOperational: markControllerOperational,
		onShift,
		store,
	});
	handleReconnectAdvertisement.current = (selected, event) => {
		const expectedRole = roleForDevice(devicesRef.current, selected.id);
		const advertisedRole = clickControllerRoleFromManufacturerData(event.manufacturerData);
		if (expectedRole && advertisedRole && expectedRole !== advertisedRole) {
			reconnectController.current.cancel(selected.id, true);
			store.actions.setControllerPhase(expectedRole, 'offline');
			return;
		}
		if (expectedRole) {
			abortPendingClickConnectionOnAdvertisement(
				selected,
				connectingRoles.current.has(expectedRole)
			);
		}
	};

	const cleanupConnection = useCallback((role: ClickShift) => {
		connections.current.get(role)?.cleanup();
		connections.current.delete(role);
	}, []);

	const handleControllerDisconnect = useCallback(
		(role: ClickShift, selected: BluetoothDevice) => {
			cleanupConnection(role);
			operationalRoles.current.delete(role);
			clickInput.resetControllerInput(selected.id);
			const shouldReconnect = shouldMaintainClickConnection(
				autoReconnect.current,
				connectionActive.current,
				forgottenIds.current.has(selected.id)
			);
			setControllerPhase(role, shouldReconnect ? 'reconnecting' : 'offline');
			if (shouldReconnect) {
				scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
			}
		},
		[cleanupConnection, clickInput.resetControllerInput, setControllerPhase]
	);

	const establishControllerConnection = useCallback(
		async (
			selected: BluetoothDevice,
			role: ClickShift,
			isCurrentAttempt: () => boolean,
			rediscover: boolean
		) => {
			const handleDisconnect = () => handleControllerDisconnect(role, selected);
			const connection = await connectClickDevice(selected, rediscover, {
				isCurrent: isCurrentAttempt,
				isOperational: () => operationalRoles.current.has(role),
				onDetails: (details) => updateControllerDetails(role, details),
				onDisconnect: handleDisconnect,
				onMessage: (event) => {
					markControllerOperational(role);
					clickInput.handleControllerMessage(role, selected.id, event);
				},
			});
			connections.current.set(role, connection);
		},
		[
			clickInput.handleControllerMessage,
			handleControllerDisconnect,
			markControllerOperational,
			updateControllerDetails,
		]
	);

	const beginControllerConnectionAttempt = useCallback(
		(selected: BluetoothDevice, role: ClickShift, rediscover: boolean) => {
			if (forgottenIds.current.has(selected.id)) {
				return;
			}
			if (connectingRoles.current.has(role)) {
				return;
			}
			reconnectController.current.cancel(selected.id);
			const attempt = (connectionAttempts.current.get(role) ?? 0) + 1;
			connectionAttempts.current.set(role, attempt);
			connectingRoles.current.add(role);
			setControllerPhase(role, rediscover ? 'reconnecting' : 'connecting');
			clickInput.resetControllerInput(selected.id);
			return attempt;
		},
		[clickInput.resetControllerInput, setControllerPhase]
	);

	const handleConnectionFailure = useCallback(
		(selected: BluetoothDevice, role: ClickShift, error: unknown, scheduleRetry: boolean) => {
			cleanupConnection(role);
			operationalRoles.current.delete(role);
			clickInput.clearDeviceHeldShifts(selected.id);
			selected.gatt?.disconnect();
			const shouldReconnect = shouldMaintainClickConnection(
				autoReconnect.current,
				connectionActive.current,
				forgottenIds.current.has(selected.id)
			);
			setControllerPhase(role, shouldReconnect ? 'reconnecting' : 'offline');
			if (!(shouldReconnect || reportedConnectionFailures.current.has(selected.id))) {
				reportedConnectionFailures.current.add(selected.id);
				setNotice(`Zwift Click connection failed: ${errorMessage(error)}`);
			}
			if (shouldReconnect && scheduleRetry) {
				scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
			}
		},
		[cleanupConnection, clickInput.clearDeviceHeldShifts, setControllerPhase, setNotice]
	);

	useEffect(
		() => () => {
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
		},
		[]
	);

	const connectDevice = useCallback(
		async (
			selected: BluetoothDevice,
			role: ClickShift,
			{ rediscover = false, scheduleRetry = true }: ClickConnectionOptions = {}
		): Promise<boolean> => {
			if (!connectionActive.current) {
				return false;
			}
			const connectionAttempt = beginControllerConnectionAttempt(selected, role, rediscover);
			if (connectionAttempt === undefined) {
				return false;
			}
			const isCurrentAttempt = () =>
				connectionAttempts.current.get(role) === connectionAttempt;
			try {
				await establishControllerConnection(selected, role, isCurrentAttempt, rediscover);
				operationalRoles.current.add(role);
				setControllerPhase(role, 'connected');
				reconnectController.current.reset(selected.id);
				reportedConnectionFailures.current.delete(selected.id);
				return true;
			} catch (error) {
				if (error instanceof SupersededClickConnectionError || !isCurrentAttempt()) {
					return false;
				}
				handleConnectionFailure(selected, role, error, scheduleRetry);
				return false;
			} finally {
				if (isCurrentAttempt()) {
					connectingRoles.current.delete(role);
				}
			}
		},
		[
			beginControllerConnectionAttempt,
			establishControllerConnection,
			handleConnectionFailure,
			setControllerPhase,
		]
	);

	useEffect(() => {
		connectDeviceRef.current = connectDevice;
	}, [connectDevice]);

	const pair = useCallback(
		async (role: ClickShift) => {
			if (!navigator.bluetooth) {
				setNotice(WEB_BLUETOOTH_UNAVAILABLE_MESSAGE);
				return;
			}
			store.actions.setPairingRole(role);
			try {
				const selected = await navigator.bluetooth.requestDevice(
					clickControllerRequestOptions(role)
				);
				const assignedRole = roleForDevice(devicesRef.current, selected.id);
				if (assignedRole && assignedRole !== role) {
					throw new Error(
						`${clickControllerLabel(assignedRole)} is already paired. Choose the other physical controller.`
					);
				}
				autoReconnect.current = true;
				forgottenIds.current.delete(selected.id);
				devicesRef.current.set(role, selected);
				const nextControllerIds = { ...store.get().controllerIds, [role]: selected.id };
				store.actions.setController(role, selected.id);
				saveControllerIds(nextControllerIds);
				if (connectionActive.current) {
					connectDevice(selected, role);
				} else {
					setControllerPhase(role, 'connecting');
					try {
						updateControllerDetails(role, await inspectClickDeviceDetails(selected));
					} catch {
						// Pairing remains valid when optional firmware or battery inspection fails.
					} finally {
						setControllerPhase(role, 'offline');
					}
				}
			} catch (error) {
				if (!isBluetoothChooserCancellation(error)) {
					setNotice(errorMessage(error));
				}
			} finally {
				store.actions.setPairingRole(undefined);
			}
		},
		[connectDevice, setControllerPhase, setNotice, store, updateControllerDetails]
	);

	const reconnect = useCallback(() => {
		autoReconnect.current = true;
		if (!connectionActive.current) {
			return;
		}
		for (const [role, selected] of devicesRef.current) {
			const phase = store.get().controllerPhases[role];
			if (phase === 'connected') {
				continue;
			}
			reconnectController.current.reset(selected.id);
			reconnectController.current.expedite(selected.id, selected, 1);
		}
	}, [store]);

	const stopConnections = useCallback(() => {
		const devices = [...devicesRef.current.entries()];
		for (const [role, selected] of devices) {
			reconnectController.current.cancel(selected.id, true);
			connectionAttempts.current.set(role, (connectionAttempts.current.get(role) ?? 0) + 1);
			connectingRoles.current.delete(role);
			operationalRoles.current.delete(role);
			clickInput.clearDeviceHeldShifts(selected.id);
			cleanupConnection(role);
			selected.gatt?.disconnect();
		}
		store.actions.setControllerPhases(
			Object.fromEntries(devices.map(([role]) => [role, 'offline']))
		);
	}, [cleanupConnection, clickInput.clearDeviceHeldShifts, store]);

	const disconnect = useCallback(() => {
		autoReconnect.current = false;
		stopConnections();
	}, [stopConnections]);

	const setConnectionActive = useCallback(
		(active: boolean) => {
			if (connectionActive.current === active) {
				return;
			}
			connectionActive.current = active;
			if (!active) {
				stopConnections();
				return;
			}
			if (!autoReconnect.current) {
				return;
			}
			const devices = [...devicesRef.current.entries()];
			store.actions.setControllerPhases(
				Object.fromEntries(devices.map(([role]) => [role, 'reconnecting']))
			);
			reconnectBluetoothDevicesNow(
				reconnectController.current,
				devices.map(([, selected]) => selected)
			);
		},
		[stopConnections, store]
	);

	const forgetDevice = useCallback(
		async (role: ClickShift) => {
			const selected = devicesRef.current.get(role);
			if (!selected) {
				return;
			}
			const { id: deviceId } = selected;
			forgottenIds.current.add(deviceId);
			operationalRoles.current.delete(role);
			reconnectController.current.cancel(deviceId, true);
			clickInput.clearDeviceHeldShifts(deviceId);
			cleanupConnection(role);
			selected.gatt?.disconnect();
			try {
				await selected.forget();
			} finally {
				const nextControllerDetails = { ...store.get().controllerDetails };
				delete nextControllerDetails[role];
				devicesRef.current.delete(role);
				store.actions.removeController(role);
				const nextControllerIds = { ...store.get().controllerIds };
				delete nextControllerIds[role];
				saveControllerIds(nextControllerIds);
				saveControllerDetails(nextControllerDetails);
			}
		},
		[cleanupConnection, clickInput.clearDeviceHeldShifts, store]
	);

	const forget = useCallback(async () => {
		autoReconnect.current = false;
		for (const role of [...devicesRef.current.keys()]) {
			await forgetDevice(role);
		}
	}, [forgetDevice]);

	usePageHide(() => {
		autoReconnect.current = false;
		connectionActive.current = false;
		stopConnections();
	});

	useEffect(() => {
		if (rememberedDeviceCatalog.error) {
			store.actions.setControllerPhases(
				Object.fromEntries(
					Object.keys(store.get().controllerPhases).map((role) => [role, 'offline'])
				)
			);
			return;
		}
		if (!rememberedDeviceCatalog.devices) {
			return;
		}
		const storedControllerIds = storedClickControllerDeviceIds();
		const storedControllerDetailsByRole = storedClickControllerDetails();
		const remembered = rememberedClickControllerState(
			rememberedDeviceCatalog.devices,
			storedControllerIds,
			storedControllerDetailsByRole
		);
		devicesRef.current = remembered.devices;
		store.actions.setControllerDetailsByRole(remembered.controllerDetails);
		store.actions.setControllers(remembered.controllerIds);
		saveControllerDetails(remembered.controllerDetails);
		saveControllerIds(remembered.controllerIds);
		const rememberedPhase = connectionActive.current ? 'reconnecting' : 'offline';
		store.actions.setControllerPhases(
			Object.fromEntries(
				[...remembered.devices.keys()].map((role) => [role, rememberedPhase])
			)
		);
		for (const selected of remembered.devices.values()) {
			forgottenIds.current.delete(selected.id);
		}
		autoReconnect.current = true;
		if (connectionActive.current) {
			reconnectBluetoothDevicesNow(reconnectController.current, [
				...remembered.devices.values(),
			]);
		}
	}, [rememberedDeviceCatalog.devices, rememberedDeviceCatalog.error, store]);

	const pairedRoles = CLICK_CONTROLLER_ORDER.filter((role) => state.controllerIds[role]);
	const connectionPhases = pairedRoles.map((role) => state.controllerPhases[role] ?? 'offline');
	const connection = deviceConnectionView(aggregateConnectionPhase(connectionPhases));
	const connectedCount = connectedDeviceCount(connectionPhases);
	return {
		...connection,
		connectedCount,
		connectionActive: connectionActive.current,
		controllers: CLICK_CONTROLLER_ORDER.map((role) => {
			const activeShift = state.activeControllerShifts[role];
			return {
				active: activeShift !== undefined,
				activeShift,
				...state.controllerDetails[role],
				...deviceConnectionView(
					state.controllerIds[role]
						? (state.controllerPhases[role] ?? 'offline')
						: 'unpaired'
				),
				id: state.controllerIds[role],
				label: clickControllerLabel(role),
				role,
			};
		}),
		disconnect,
		forget,
		forgetDevice,
		pair,
		pairedCount: pairedRoles.length,
		pairingRole: state.pairingRole,
		reconnect,
		setConnectionActive,
	};
}
