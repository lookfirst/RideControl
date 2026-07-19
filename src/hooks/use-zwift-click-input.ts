import { useCallback, useEffect, useRef } from 'react';
import {
	CLICK_CONTROLLER_ROLES_STORAGE_KEY,
	type ClickControllerRoles,
	type ClickShift,
	filterAcceptedClickShifts,
	filterClickShiftsForController,
	parseClickV2Shift,
	registerClickControllerRole,
} from '../lib/zwift-click';
import type { ZwiftClickStore } from '../stores/zwift-click-store';

interface ClickRepeatTimer {
	delay: number;
	interval?: number;
}

const CLICK_HOLD_DELAY_MS = 600;
const CLICK_HOLD_REPEAT_MS = 220;
const CLICK_CONTROLLER_FLASH_MS = 350;
const CLICK_SHIFTS: ClickShift[] = ['down', 'up'];

function saveControllerRoles(roles: ClickControllerRoles) {
	localStorage.setItem(CLICK_CONTROLLER_ROLES_STORAGE_KEY, JSON.stringify(roles));
}

export function useZwiftClickInput({
	identifyControllers,
	onOperational,
	onShift,
	store,
}: {
	identifyControllers: boolean;
	onOperational: (deviceId: string) => void;
	onShift: (change: number) => void;
	store: ZwiftClickStore;
}) {
	const controllerFlashTimers = useRef(new Map<string, number>());
	const controllerRoles = useRef<ClickControllerRoles>({});
	const heldShiftsByDevice = useRef(new Map<string, ClickShift[]>());
	const identifyControllersRef = useRef(identifyControllers);
	const previousButtonMaps = useRef(new Map<string, number>());
	const lastShiftTimes = useRef(new Map<ClickShift, number>());
	const repeatTimers = useRef(new Map<ClickShift, ClickRepeatTimer>());
	const onShiftRef = useRef(onShift);

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
			store.actions.clearActiveControllers();
		}
	}, [identifyControllers, store]);

	const registerControllerRole = useCallback(
		(deviceId: string, shifts: ClickShift[]) => {
			const next = registerClickControllerRole(controllerRoles.current, deviceId, shifts);
			if (next === controllerRoles.current) {
				return;
			}
			controllerRoles.current = next;
			store.actions.setControllerRoles(next);
			saveControllerRoles(next);
		},
		[store]
	);

	const forgetControllerRole = useCallback(
		(deviceId: string) => {
			if (!controllerRoles.current[deviceId]) {
				return;
			}
			const next = { ...controllerRoles.current };
			delete next[deviceId];
			controllerRoles.current = next;
			store.actions.setControllerRoles(next);
			saveControllerRoles(next);
		},
		[store]
	);

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

	const flashController = useCallback(
		(deviceId: string) => {
			if (!identifyControllersRef.current) {
				return;
			}
			window.clearTimeout(controllerFlashTimers.current.get(deviceId));
			store.actions.activateController(deviceId);
			const timer = window.setTimeout(() => {
				controllerFlashTimers.current.delete(deviceId);
				store.actions.deactivateController(deviceId);
			}, CLICK_CONTROLLER_FLASH_MS);
			controllerFlashTimers.current.set(deviceId, timer);
		},
		[store]
	);

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
			onOperational(deviceId);
			previousButtonMaps.current.set(deviceId, parsed.buttonMap);
			const controllerRole = controllerRoles.current[deviceId];
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
		[flashController, onOperational, registerControllerRole, setDeviceHeldShifts]
	);

	const resetControllerInput = useCallback(
		(deviceId: string) => {
			previousButtonMaps.current.delete(deviceId);
			clearDeviceHeldShifts(deviceId);
		},
		[clearDeviceHeldShifts]
	);

	const restoreControllerRoles = useCallback(
		(roles: ClickControllerRoles) => {
			controllerRoles.current = roles;
			store.actions.setControllerRoles(roles);
		},
		[store]
	);

	useEffect(
		() => () => {
			for (const timer of controllerFlashTimers.current.values()) {
				window.clearTimeout(timer);
			}
			for (const shift of repeatTimers.current.keys()) {
				stopRepeat(shift);
			}
		},
		[stopRepeat]
	);

	return {
		clearDeviceHeldShifts,
		forgetControllerRole,
		handleControllerMessage,
		registerControllerRole,
		resetControllerInput,
		restoreControllerRoles,
	};
}
