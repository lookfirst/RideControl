import { useCallback, useEffect, useRef, useState } from 'react';
import { BATTERY } from '../constants';
import {
	aggregateConnectionPhase,
	type DeviceConnectionPhase,
	deviceConnectionView,
	removeConnectionPhase,
	setConnectionPhase,
} from '../lib/device-connection';
import { createReconnectController } from '../lib/reconnect-controller';
import {
	type ClickControllerRoles,
	type ClickShift,
	filterAcceptedClickShifts,
	filterClickShiftsForController,
	parseClickV2Shift,
	registerClickControllerRole,
	storedClickControllerRoles,
	storedClickDeviceIds,
	ZWIFT_CLICK_NAME,
	ZWIFT_CLICK_SERVICE,
	ZWIFT_LEGACY_SERVICE,
	ZWIFT_MANUFACTURER_ID,
} from '../lib/zwift-click';
import { connectClickDevice, SupersededClickConnectionError } from '../lib/zwift-click-device';

interface ClickRepeatTimer {
	delay: number;
	interval?: number;
}

interface ClickConnectionOptions {
	force?: boolean;
	rediscover?: boolean;
	scheduleRetry?: boolean;
}

const STORAGE_KEY = 'zwift-click-v2-device-ids';
const CONTROLLER_ROLES_STORAGE_KEY = 'zwift-click-v2-controller-roles';
const CLICK_HOLD_DELAY_MS = 600;
const CLICK_HOLD_REPEAT_MS = 220;
const CLICK_CONTROLLER_FLASH_MS = 350;
const CLICK_SHIFTS: ClickShift[] = ['down', 'up'];

type ClickConnectionCleanup = () => void;

function saveDeviceIds(devices: BluetoothDevice[]) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(devices.map(({ id }) => id).slice(0, 2)));
}

function saveControllerRoles(roles: ClickControllerRoles) {
	localStorage.setItem(CONTROLLER_ROLES_STORAGE_KEY, JSON.stringify(roles));
}

function controllerLabel(role: ClickShift | undefined) {
	if (role === 'up') {
		return '+ Controller';
	}
	if (role === 'down') {
		return '− Controller';
	}
	return 'Press a button to identify';
}

function shouldAutoReconnect(
	autoReconnect: boolean,
	forgottenIds: ReadonlySet<string>,
	deviceId: string
) {
	return autoReconnect && !forgottenIds.has(deviceId);
}

export function useZwiftClick(
	onShift: (change: number) => void,
	setNotice: (notice: string) => void,
	identifyControllers = false
) {
	const [devices, setDevices] = useState<BluetoothDevice[]>([]);
	const [controllerPhases, setControllerPhases] = useState<Record<string, DeviceConnectionPhase>>(
		{}
	);
	const [activeControllerIds, setActiveControllerIds] = useState<string[]>([]);
	const [controllerRoles, setControllerRoles] = useState<ClickControllerRoles>({});
	const [pairing, setPairing] = useState(false);
	const autoReconnect = useRef(true);
	const connectingIds = useRef(new Set<string>());
	const connectionAttempts = useRef(new Map<string, number>());
	const connectionCleanups = useRef(new Map<string, ClickConnectionCleanup>());
	const controllerFlashTimers = useRef(new Map<string, number>());
	const controllerRolesRef = useRef<ClickControllerRoles>({});
	const devicesRef = useRef<BluetoothDevice[]>([]);
	const forgottenIds = useRef(new Set<string>());
	const heldShiftsByDevice = useRef(new Map<string, ClickShift[]>());
	const identifyControllersRef = useRef(identifyControllers);
	const previousButtonMaps = useRef(new Map<string, number>());
	const reportedConnectionFailures = useRef(new Set<string>());
	const lastShiftTimes = useRef(new Map<ClickShift, number>());
	const repeatTimers = useRef(new Map<ClickShift, ClickRepeatTimer>());
	const connectDeviceRef = useRef<
		| ((selected: BluetoothDevice, options?: ClickConnectionOptions) => Promise<boolean>)
		| undefined
	>(undefined);
	const onShiftRef = useRef(onShift);
	const operationalIds = useRef(new Set<string>());
	const reconnectController = useRef(
		createReconnectController<BluetoothDevice>({
			attempt: (selected) =>
				connectDeviceRef.current?.(selected, {
					rediscover: true,
					scheduleRetry: false,
				}) ?? Promise.resolve(false),
			canRetry: (selected) => autoReconnect.current && !forgottenIds.current.has(selected.id),
			delayForAttempt: (attempt) => Math.min(1000, 400 * 2 ** (attempt - 1)),
			onWaiting: (selected) =>
				setControllerPhases((current) =>
					setConnectionPhase(current, selected.id, 'reconnecting')
				),
		})
	);

	useEffect(() => {
		onShiftRef.current = onShift;
	}, [onShift]);

	useEffect(() => {
		identifyControllersRef.current = identifyControllers;
		if (!identifyControllers) {
			for (const timer of controllerFlashTimers.current.values()) {
				window.clearTimeout(timer);
			}
			controllerFlashTimers.current.clear();
			setActiveControllerIds((current) => (current.length ? [] : current));
		}
	}, [identifyControllers]);

	useEffect(
		() => () => {
			for (const timer of controllerFlashTimers.current.values()) {
				window.clearTimeout(timer);
			}
		},
		[]
	);

	const registerControllerRole = useCallback((deviceId: string, shifts: ClickShift[]) => {
		const next = registerClickControllerRole(controllerRolesRef.current, deviceId, shifts);
		if (next === controllerRolesRef.current) {
			return;
		}
		controllerRolesRef.current = next;
		setControllerRoles(next);
		saveControllerRoles(next);
	}, []);

	const forgetControllerRole = useCallback((deviceId: string) => {
		if (!controllerRolesRef.current[deviceId]) {
			return;
		}
		const next = { ...controllerRolesRef.current };
		delete next[deviceId];
		controllerRolesRef.current = next;
		setControllerRoles(next);
		saveControllerRoles(next);
	}, []);

	const stopRepeat = useCallback((shift: ClickShift) => {
		const timer = repeatTimers.current.get(shift);
		if (!timer) {
			return;
		}
		window.clearTimeout(timer.delay);
		window.clearInterval(timer.interval);
		repeatTimers.current.delete(shift);
	}, []);

	const syncRepeats = useCallback(() => {
		const heldShifts = new Set<ClickShift>();
		for (const deviceShifts of heldShiftsByDevice.current.values()) {
			for (const shift of deviceShifts) {
				heldShifts.add(shift);
			}
		}
		for (const shift of CLICK_SHIFTS) {
			if (!heldShifts.has(shift)) {
				stopRepeat(shift);
				continue;
			}
			if (repeatTimers.current.has(shift)) {
				continue;
			}
			const change = shift === 'down' ? -1 : 1;
			const timer: ClickRepeatTimer = { delay: 0 };
			timer.delay = window.setTimeout(() => {
				onShiftRef.current(change);
				timer.interval = window.setInterval(
					() => onShiftRef.current(change),
					CLICK_HOLD_REPEAT_MS
				);
			}, CLICK_HOLD_DELAY_MS);
			repeatTimers.current.set(shift, timer);
		}
	}, [stopRepeat]);

	const setDeviceHeldShifts = useCallback(
		(deviceId: string, heldShifts: ClickShift[]) => {
			if (heldShifts.length) {
				heldShiftsByDevice.current.set(deviceId, heldShifts);
			} else {
				heldShiftsByDevice.current.delete(deviceId);
			}
			syncRepeats();
		},
		[syncRepeats]
	);

	const clearDeviceHeldShifts = useCallback(
		(deviceId: string) => {
			heldShiftsByDevice.current.delete(deviceId);
			syncRepeats();
		},
		[syncRepeats]
	);

	useEffect(
		() => () => {
			for (const shift of repeatTimers.current.keys()) {
				stopRepeat(shift);
			}
		},
		[stopRepeat]
	);

	const cleanupConnection = useCallback((deviceId: string) => {
		connectionCleanups.current.get(deviceId)?.();
		connectionCleanups.current.delete(deviceId);
	}, []);

	const flashController = useCallback((deviceId: string) => {
		if (!identifyControllersRef.current) {
			return;
		}
		window.clearTimeout(controllerFlashTimers.current.get(deviceId));
		setActiveControllerIds((current) =>
			current.includes(deviceId) ? current : [...current, deviceId]
		);
		const timer = window.setTimeout(() => {
			controllerFlashTimers.current.delete(deviceId);
			setActiveControllerIds((current) => current.filter((id) => id !== deviceId));
		}, CLICK_CONTROLLER_FLASH_MS);
		controllerFlashTimers.current.set(deviceId, timer);
	}, []);

	const handleControllerMessage = useCallback(
		(deviceId: string, event: Event) => {
			const { value } = event.target as BluetoothRemoteGATTCharacteristic;
			if (!value) {
				return;
			}
			const parsed = parseClickV2Shift(value, previousButtonMaps.current.get(deviceId));
			if (!parsed) {
				return;
			}
			operationalIds.current.add(deviceId);
			reconnectController.current.reset(deviceId);
			reportedConnectionFailures.current.delete(deviceId);
			setControllerPhases((current) => setConnectionPhase(current, deviceId, 'connected'));
			previousButtonMaps.current.set(deviceId, parsed.buttonMap);
			const controllerRole = controllerRolesRef.current[deviceId];
			const heldShifts = filterClickShiftsForController(parsed.heldShifts, controllerRole);
			const controllerShifts = filterClickShiftsForController(parsed.shifts, controllerRole);
			setDeviceHeldShifts(deviceId, heldShifts);
			const acceptedShifts = filterAcceptedClickShifts(
				controllerShifts,
				performance.now(),
				lastShiftTimes.current
			);
			if (acceptedShifts.length) {
				flashController(deviceId);
			}
			if (identifyControllersRef.current) {
				registerControllerRole(deviceId, acceptedShifts);
			}
			for (const shift of acceptedShifts) {
				onShiftRef.current(shift === 'down' ? -1 : 1);
			}
		},
		[flashController, registerControllerRole, setDeviceHeldShifts]
	);

	const handleControllerDisconnect = useCallback(
		(selected: BluetoothDevice) => {
			cleanupConnection(selected.id);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			previousButtonMaps.current.delete(selected.id);
			if (shouldAutoReconnect(autoReconnect.current, forgottenIds.current, selected.id)) {
				setControllerPhases((current) =>
					setConnectionPhase(current, selected.id, 'reconnecting')
				);
				reconnectController.current.start(selected.id, selected);
			} else {
				setControllerPhases((current) =>
					setConnectionPhase(current, selected.id, 'offline')
				);
			}
		},
		[cleanupConnection, clearDeviceHeldShifts]
	);

	const establishControllerConnection = useCallback(
		async (selected: BluetoothDevice, isCurrentAttempt: () => boolean, rediscover: boolean) => {
			const handleDisconnect = () => handleControllerDisconnect(selected);
			const cleanup = await connectClickDevice(selected, rediscover, {
				isCurrent: isCurrentAttempt,
				isOperational: () => operationalIds.current.has(selected.id),
				onControllerRole: (role) => registerControllerRole(selected.id, [role]),
				onDisconnect: handleDisconnect,
				onMessage: (event) => handleControllerMessage(selected.id, event),
			});
			connectionCleanups.current.set(selected.id, cleanup);
		},
		[handleControllerDisconnect, handleControllerMessage, registerControllerRole]
	);

	const beginControllerConnectionAttempt = useCallback(
		(selected: BluetoothDevice, force: boolean, rediscover: boolean) => {
			if (forgottenIds.current.has(selected.id)) {
				return;
			}
			if (connectingIds.current.has(selected.id) && !force) {
				return;
			}
			if (force) {
				operationalIds.current.delete(selected.id);
				connectionAttempts.current.set(
					selected.id,
					(connectionAttempts.current.get(selected.id) ?? 0) + 1
				);
				connectingIds.current.delete(selected.id);
				cleanupConnection(selected.id);
				selected.gatt?.disconnect();
			}
			reconnectController.current.cancel(selected.id);
			const attempt = (connectionAttempts.current.get(selected.id) ?? 0) + 1;
			connectionAttempts.current.set(selected.id, attempt);
			connectingIds.current.add(selected.id);
			setControllerPhases((current) =>
				setConnectionPhase(
					current,
					selected.id,
					force || rediscover ? 'reconnecting' : 'connecting'
				)
			);
			previousButtonMaps.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			return attempt;
		},
		[cleanupConnection, clearDeviceHeldShifts]
	);

	const handleConnectionFailure = useCallback(
		(selected: BluetoothDevice, error: unknown, scheduleRetry: boolean) => {
			cleanupConnection(selected.id);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			selected.gatt?.disconnect();
			const shouldReconnect = shouldAutoReconnect(
				autoReconnect.current,
				forgottenIds.current,
				selected.id
			);
			setControllerPhases((current) =>
				setConnectionPhase(
					current,
					selected.id,
					shouldReconnect ? 'reconnecting' : 'offline'
				)
			);
			if (!(shouldReconnect || reportedConnectionFailures.current.has(selected.id))) {
				reportedConnectionFailures.current.add(selected.id);
				setNotice(
					`Zwift Click connection failed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
			if (shouldReconnect && scheduleRetry) {
				reconnectController.current.start(selected.id, selected);
			}
		},
		[cleanupConnection, clearDeviceHeldShifts, setNotice]
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
			{ force = false, rediscover = false, scheduleRetry = true }: ClickConnectionOptions = {}
		): Promise<boolean> => {
			const connectionAttempt = beginControllerConnectionAttempt(selected, force, rediscover);
			if (connectionAttempt === undefined) {
				return false;
			}
			const isCurrentAttempt = () =>
				connectionAttempts.current.get(selected.id) === connectionAttempt;
			try {
				await establishControllerConnection(selected, isCurrentAttempt, rediscover);
				operationalIds.current.add(selected.id);
				setControllerPhases((current) =>
					setConnectionPhase(current, selected.id, 'connected')
				);
				reconnectController.current.reset(selected.id);
				reportedConnectionFailures.current.delete(selected.id);
				return true;
			} catch (error) {
				if (error instanceof SupersededClickConnectionError || !isCurrentAttempt()) {
					return false;
				}
				handleConnectionFailure(selected, error, scheduleRetry);
				return false;
			} finally {
				if (isCurrentAttempt()) {
					connectingIds.current.delete(selected.id);
				}
			}
		},
		[beginControllerConnectionAttempt, establishControllerConnection, handleConnectionFailure]
	);

	useEffect(() => {
		connectDeviceRef.current = connectDevice;
	}, [connectDevice]);

	const pair = useCallback(async () => {
		if (!navigator.bluetooth) {
			setNotice('Web Bluetooth requires current Chrome or Edge on localhost or HTTPS.');
			return;
		}
		setPairing(true);
		try {
			const selected = await navigator.bluetooth.requestDevice({
				filters: [{ name: ZWIFT_CLICK_NAME }],
				optionalManufacturerData: [ZWIFT_MANUFACTURER_ID],
				optionalServices: [ZWIFT_CLICK_SERVICE, ZWIFT_LEGACY_SERVICE, BATTERY],
			});
			autoReconnect.current = true;
			forgottenIds.current.delete(selected.id);
			setDevices((current) => {
				const next = current.some(({ id }) => id === selected.id)
					? current
					: [...current, selected].slice(0, 2);
				devicesRef.current = next;
				saveDeviceIds(next);
				return next;
			});
			// Do not make selection of the second controller wait for this controller's
			// complete GATT setup. Its connection continues independently in the background.
			connectDevice(selected);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
				setNotice(error instanceof Error ? error.message : String(error));
			}
		} finally {
			setPairing(false);
		}
	}, [connectDevice, setNotice]);

	const reconnect = useCallback(() => {
		autoReconnect.current = true;
		for (const selected of devices) {
			if (controllerPhases[selected.id] === 'connected') {
				continue;
			}
			reconnectController.current.reset(selected.id);
			reconnectController.current.start(selected.id, selected, 1);
		}
	}, [controllerPhases, devices]);

	const disconnect = useCallback(() => {
		autoReconnect.current = false;
		for (const selected of devices) {
			reconnectController.current.cancel(selected.id, true);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			cleanupConnection(selected.id);
			selected.gatt?.disconnect();
		}
		setControllerPhases(
			Object.fromEntries(devices.map((selected) => [selected.id, 'offline']))
		);
	}, [cleanupConnection, clearDeviceHeldShifts, devices]);

	const forgetDevice = useCallback(
		async (deviceId: string) => {
			forgottenIds.current.add(deviceId);
			operationalIds.current.delete(deviceId);
			reconnectController.current.cancel(deviceId, true);
			clearDeviceHeldShifts(deviceId);
			forgetControllerRole(deviceId);
			const selected = devices.find(({ id }) => id === deviceId);
			cleanupConnection(deviceId);
			selected?.gatt?.disconnect();
			try {
				await selected?.forget();
			} finally {
				setDevices((current) => {
					const next = current.filter(({ id }) => id !== deviceId);
					devicesRef.current = next;
					saveDeviceIds(next);
					return next;
				});
				setControllerPhases((current) => removeConnectionPhase(current, deviceId));
			}
		},
		[cleanupConnection, clearDeviceHeldShifts, devices, forgetControllerRole]
	);

	const forget = useCallback(async () => {
		autoReconnect.current = false;
		for (const selected of [...devices]) {
			await forgetDevice(selected.id);
		}
	}, [devices, forgetDevice]);

	useEffect(() => {
		let cancelled = false;
		async function restore() {
			if (!navigator.bluetooth?.getDevices) {
				return;
			}
			const ids = storedClickDeviceIds();
			if (!ids.length) {
				return;
			}
			const permitted = await navigator.bluetooth.getDevices();
			const remembered = ids
				.map((id) => permitted.find((candidate) => candidate.id === id))
				.filter((candidate): candidate is BluetoothDevice => Boolean(candidate))
				.slice(0, 2);
			if (cancelled) {
				return;
			}
			const rememberedIds = new Set(remembered.map(({ id }) => id));
			const rememberedRoles = Object.fromEntries(
				Object.entries(storedClickControllerRoles()).filter(([deviceId]) =>
					rememberedIds.has(deviceId)
				)
			) as ClickControllerRoles;
			controllerRolesRef.current = rememberedRoles;
			devicesRef.current = remembered;
			setControllerRoles(rememberedRoles);
			setDevices(remembered);
			setControllerPhases(
				Object.fromEntries(remembered.map((selected) => [selected.id, 'reconnecting']))
			);
			for (const selected of remembered) {
				forgottenIds.current.delete(selected.id);
			}
			autoReconnect.current = true;
			for (const selected of remembered) {
				reconnectController.current.start(selected.id, selected, 1);
			}
		}
		restore().catch(() => {
			setControllerPhases((current) =>
				Object.fromEntries(Object.keys(current).map((deviceId) => [deviceId, 'offline']))
			);
		});
		return () => {
			cancelled = true;
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
		};
	}, []);

	const connectionPhases = devices.map((selected) => controllerPhases[selected.id] ?? 'offline');
	const connection = deviceConnectionView(aggregateConnectionPhase(connectionPhases));
	const connectedCount = connectionPhases.filter((phase) => phase === 'connected').length;
	return {
		...connection,
		connectedCount,
		controllers: devices.map((selected) => ({
			active: activeControllerIds.includes(selected.id),
			...deviceConnectionView(controllerPhases[selected.id] ?? 'offline'),
			id: selected.id,
			label: controllerLabel(controllerRoles[selected.id]),
		})),
		disconnect,
		forget,
		forgetDevice,
		pair,
		pairedCount: devices.length,
		pairing,
		reconnect,
	};
}
