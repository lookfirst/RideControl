import { useCallback, useEffect, useRef, useState } from 'react';
import { BATTERY } from '../constants';
import {
	type ClickControllerRoles,
	type ClickShift,
	clickV2StartCommand,
	connectClickGatt,
	filterAcceptedClickShifts,
	filterClickShiftsForController,
	parseClickV2Shift,
	registerClickControllerRole,
	storedClickControllerRoles,
	storedClickDeviceIds,
	waitForUsableClickNotification,
	withClickConnectionTimeout,
	ZWIFT_ASYNC_CHARACTERISTIC,
	ZWIFT_CLICK_NAME,
	ZWIFT_CLICK_SERVICE,
	ZWIFT_LEGACY_SERVICE,
	ZWIFT_MANUFACTURER_ID,
	ZWIFT_SYNC_RX_CHARACTERISTIC,
	ZWIFT_SYNC_TX_CHARACTERISTIC,
} from '../lib/zwift-click';

interface ClickRepeatTimer {
	delay: number;
	interval?: number;
}

interface ClickConnectionOptions {
	force?: boolean;
	rediscover?: boolean;
}

const STORAGE_KEY = 'zwift-click-v2-device-ids';
const CONTROLLER_ROLES_STORAGE_KEY = 'zwift-click-v2-controller-roles';
const CLICK_HOLD_DELAY_MS = 600;
const CLICK_HOLD_REPEAT_MS = 220;
const CLICK_RECONNECT_BASE_DELAY_MS = 400;
const CLICK_RECONNECT_MAX_DELAY_MS = 1000;
const CLICK_CONTROLLER_FLASH_MS = 350;
const CLICK_SETUP_STEP_TIMEOUT_MS = 3000;
const CLICK_SHIFTS: ClickShift[] = ['down', 'up'];

type ClickConnectionCleanup = () => void;

class SupersededClickConnectionError extends Error {}

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

function ensureCurrentConnection(isCurrent: () => boolean) {
	if (!isCurrent()) {
		throw new SupersededClickConnectionError();
	}
}

async function clickService(server: BluetoothRemoteGATTServer) {
	try {
		return await server.getPrimaryService(ZWIFT_CLICK_SERVICE);
	} catch {
		return server.getPrimaryService(ZWIFT_LEGACY_SERVICE);
	}
}

export function useZwiftClick(
	onShift: (change: number) => void,
	setNotice: (notice: string) => void,
	identifyControllers = false
) {
	const [devices, setDevices] = useState<BluetoothDevice[]>([]);
	const [connectedIds, setConnectedIds] = useState<string[]>([]);
	const [connectingControllerIds, setConnectingControllerIds] = useState<string[]>([]);
	const [activeControllerIds, setActiveControllerIds] = useState<string[]>([]);
	const [controllerRoles, setControllerRoles] = useState<ClickControllerRoles>({});
	const [busy, setBusy] = useState(false);
	const [pairing, setPairing] = useState(false);
	const [status, setStatus] = useState('Not paired');
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
	const reconnectAttempts = useRef(new Map<string, number>());
	const reconnectTimers = useRef(new Map<string, number>());
	const reportedConnectionFailures = useRef(new Set<string>());
	const lastShiftTimes = useRef(new Map<ClickShift, number>());
	const repeatTimers = useRef(new Map<ClickShift, ClickRepeatTimer>());
	const connectDeviceRef = useRef<
		| ((selected: BluetoothDevice, options?: ClickConnectionOptions) => Promise<boolean>)
		| undefined
	>(undefined);
	const onShiftRef = useRef(onShift);
	const operationalIds = useRef(new Set<string>());

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

	const cancelReconnect = useCallback((deviceId: string, resetAttempts = false) => {
		const timer = reconnectTimers.current.get(deviceId);
		if (timer !== undefined) {
			window.clearTimeout(timer);
			reconnectTimers.current.delete(deviceId);
		}
		if (resetAttempts) {
			reconnectAttempts.current.delete(deviceId);
		}
	}, []);

	const scheduleReconnect = useCallback((selected: BluetoothDevice) => {
		if (
			!autoReconnect.current ||
			forgottenIds.current.has(selected.id) ||
			reconnectTimers.current.has(selected.id)
		) {
			return;
		}
		const attempt = (reconnectAttempts.current.get(selected.id) ?? 0) + 1;
		reconnectAttempts.current.set(selected.id, attempt);
		const delay = Math.min(
			CLICK_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
			CLICK_RECONNECT_MAX_DELAY_MS
		);
		const timer = window.setTimeout(() => {
			reconnectTimers.current.delete(selected.id);
			connectDeviceRef.current?.(selected, { rediscover: true });
		}, delay);
		reconnectTimers.current.set(selected.id, timer);
	}, []);

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
			cancelReconnect(deviceId, true);
			reportedConnectionFailures.current.delete(deviceId);
			setConnectedIds((current) => {
				const next = current.includes(deviceId) ? current : [...current, deviceId];
				setStatus(
					next.length >= devicesRef.current.length ? 'Connected' : 'Paired · reconnecting'
				);
				return next;
			});
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
		[cancelReconnect, flashController, registerControllerRole, setDeviceHeldShifts]
	);

	const handleControllerDisconnect = useCallback(
		(selected: BluetoothDevice) => {
			cleanupConnection(selected.id);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			previousButtonMaps.current.delete(selected.id);
			setConnectedIds((current) => current.filter((id) => id !== selected.id));
			if (shouldAutoReconnect(autoReconnect.current, forgottenIds.current, selected.id)) {
				setStatus('Paired · reconnecting');
				scheduleReconnect(selected);
			} else {
				setStatus('Paired · offline');
			}
		},
		[cleanupConnection, clearDeviceHeldShifts, scheduleReconnect]
	);

	const establishControllerConnection = useCallback(
		async (selected: BluetoothDevice, isCurrentAttempt: () => boolean, rediscover: boolean) => {
			const server = await connectClickGatt(selected, rediscover, setStatus, (role) =>
				registerControllerRole(selected.id, [role])
			);
			ensureCurrentConnection(isCurrentAttempt);
			let removeMessageListeners = () => undefined;
			const handleDisconnect = () => handleControllerDisconnect(selected);
			const cleanup = () => {
				removeMessageListeners();
				selected.removeEventListener('gattserverdisconnected', handleDisconnect);
			};
			connectionCleanups.current.set(selected.id, cleanup);
			selected.addEventListener('gattserverdisconnected', handleDisconnect, { once: true });
			try {
				const service = await withClickConnectionTimeout(
					clickService(server),
					CLICK_SETUP_STEP_TIMEOUT_MS
				);
				ensureCurrentConnection(isCurrentAttempt);
				const [asyncCharacteristic, syncTxCharacteristic, syncRxCharacteristic] =
					await Promise.all([
						withClickConnectionTimeout(
							service.getCharacteristic(ZWIFT_ASYNC_CHARACTERISTIC),
							CLICK_SETUP_STEP_TIMEOUT_MS
						),
						withClickConnectionTimeout(
							service.getCharacteristic(ZWIFT_SYNC_TX_CHARACTERISTIC),
							CLICK_SETUP_STEP_TIMEOUT_MS
						),
						withClickConnectionTimeout(
							service.getCharacteristic(ZWIFT_SYNC_RX_CHARACTERISTIC),
							CLICK_SETUP_STEP_TIMEOUT_MS
						),
					]);
				ensureCurrentConnection(isCurrentAttempt);
				const handleMessage = (event: Event) => handleControllerMessage(selected.id, event);
				removeMessageListeners = () => {
					asyncCharacteristic.removeEventListener(
						'characteristicvaluechanged',
						handleMessage
					);
					syncTxCharacteristic.removeEventListener(
						'characteristicvaluechanged',
						handleMessage
					);
				};
				asyncCharacteristic.addEventListener('characteristicvaluechanged', handleMessage);
				syncTxCharacteristic.addEventListener('characteristicvaluechanged', handleMessage);
				await waitForUsableClickNotification(
					[
						withClickConnectionTimeout(
							asyncCharacteristic.startNotifications(),
							CLICK_SETUP_STEP_TIMEOUT_MS
						),
						withClickConnectionTimeout(
							syncTxCharacteristic.startNotifications(),
							CLICK_SETUP_STEP_TIMEOUT_MS
						),
					],
					() => operationalIds.current.has(selected.id)
				);
				ensureCurrentConnection(isCurrentAttempt);
				try {
					await withClickConnectionTimeout(
						syncRxCharacteristic.writeValueWithoutResponse(clickV2StartCommand()),
						CLICK_SETUP_STEP_TIMEOUT_MS
					);
				} catch (error) {
					if (!operationalIds.current.has(selected.id)) {
						throw error;
					}
				}
				ensureCurrentConnection(isCurrentAttempt);
			} catch (error) {
				removeMessageListeners();
				throw error;
			}
		},
		[handleControllerDisconnect, handleControllerMessage, registerControllerRole]
	);

	const beginControllerConnectionAttempt = useCallback(
		(selected: BluetoothDevice, force: boolean) => {
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
			cancelReconnect(selected.id);
			const attempt = (connectionAttempts.current.get(selected.id) ?? 0) + 1;
			connectionAttempts.current.set(selected.id, attempt);
			connectingIds.current.add(selected.id);
			setConnectingControllerIds((current) =>
				current.includes(selected.id) ? current : [...current, selected.id]
			);
			previousButtonMaps.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			setBusy(true);
			setStatus('Connecting controllers…');
			return attempt;
		},
		[cancelReconnect, cleanupConnection, clearDeviceHeldShifts]
	);

	const handleConnectionFailure = useCallback(
		(selected: BluetoothDevice, error: unknown) => {
			cleanupConnection(selected.id);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			selected.gatt?.disconnect();
			setConnectedIds((current) => current.filter((id) => id !== selected.id));
			const shouldReconnect = shouldAutoReconnect(
				autoReconnect.current,
				forgottenIds.current,
				selected.id
			);
			setStatus(shouldReconnect ? 'Paired · reconnecting' : 'Paired · offline');
			if (!(shouldReconnect || reportedConnectionFailures.current.has(selected.id))) {
				reportedConnectionFailures.current.add(selected.id);
				setNotice(
					`Zwift Click connection failed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
			if (shouldReconnect) {
				scheduleReconnect(selected);
			}
		},
		[cleanupConnection, clearDeviceHeldShifts, scheduleReconnect, setNotice]
	);

	useEffect(
		() => () => {
			autoReconnect.current = false;
			for (const deviceId of reconnectTimers.current.keys()) {
				cancelReconnect(deviceId, true);
			}
		},
		[cancelReconnect]
	);

	const connectDevice = useCallback(
		async (
			selected: BluetoothDevice,
			{ force = false, rediscover = false }: ClickConnectionOptions = {}
		): Promise<boolean> => {
			const connectionAttempt = beginControllerConnectionAttempt(selected, force);
			if (connectionAttempt === undefined) {
				return false;
			}
			const isCurrentAttempt = () =>
				connectionAttempts.current.get(selected.id) === connectionAttempt;
			try {
				await establishControllerConnection(selected, isCurrentAttempt, rediscover);
				operationalIds.current.add(selected.id);
				setConnectedIds((current) => {
					const next = current.includes(selected.id)
						? current
						: [...current, selected.id];
					setStatus(
						next.length >= devicesRef.current.length
							? 'Connected'
							: 'Paired · reconnecting'
					);
					return next;
				});
				reconnectAttempts.current.delete(selected.id);
				reportedConnectionFailures.current.delete(selected.id);
				return true;
			} catch (error) {
				if (error instanceof SupersededClickConnectionError || !isCurrentAttempt()) {
					return false;
				}
				handleConnectionFailure(selected, error);
				return false;
			} finally {
				if (isCurrentAttempt()) {
					connectingIds.current.delete(selected.id);
					setConnectingControllerIds((current) =>
						current.filter((deviceId) => deviceId !== selected.id)
					);
					setBusy(connectingIds.current.size > 0);
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

	const reconnect = useCallback(async () => {
		autoReconnect.current = true;
		await Promise.all(
			devices
				.filter((selected) => !connectedIds.includes(selected.id))
				.map((selected) => connectDevice(selected, { force: true, rediscover: true }))
		);
	}, [connectDevice, connectedIds, devices]);

	const disconnect = useCallback(() => {
		autoReconnect.current = false;
		for (const selected of devices) {
			cancelReconnect(selected.id, true);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			cleanupConnection(selected.id);
			selected.gatt?.disconnect();
		}
		setConnectedIds([]);
		setStatus(devices.length ? 'Paired · offline' : 'Not paired');
	}, [cancelReconnect, cleanupConnection, clearDeviceHeldShifts, devices]);

	const forgetDevice = useCallback(
		async (deviceId: string) => {
			forgottenIds.current.add(deviceId);
			operationalIds.current.delete(deviceId);
			cancelReconnect(deviceId, true);
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
					setStatus(next.length ? 'Paired' : 'Not paired');
					return next;
				});
				setConnectedIds((current) => current.filter((id) => id !== deviceId));
			}
		},
		[cancelReconnect, cleanupConnection, clearDeviceHeldShifts, devices, forgetControllerRole]
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
			for (const selected of remembered) {
				forgottenIds.current.delete(selected.id);
			}
			setStatus(remembered.length ? 'Paired · offline' : 'Not paired');
			autoReconnect.current = true;
			await Promise.all(
				remembered.map((selected) => connectDevice(selected, { rediscover: true }))
			);
		}
		restore().catch(() => setStatus('Paired · offline'));
		return () => {
			cancelled = true;
			autoReconnect.current = false;
		};
	}, [connectDevice]);

	return {
		busy,
		connected: connectedIds.length > 0,
		connectedCount: connectedIds.length,
		controllers: devices.map((selected) => ({
			active: activeControllerIds.includes(selected.id),
			connected: connectedIds.includes(selected.id),
			connecting: connectingControllerIds.includes(selected.id),
			id: selected.id,
			label: controllerLabel(controllerRoles[selected.id]),
		})),
		disconnect,
		forget,
		forgetDevice,
		pair,
		paired: devices.length > 0,
		pairedCount: devices.length,
		pairing,
		reconnect,
		status,
	};
}
