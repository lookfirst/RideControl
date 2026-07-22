import { useCallback, useEffect, useRef } from 'react';
import {
	CLICK_SHIFT,
	type ClickShift,
	filterAcceptedClickShifts,
	filterClickShiftsForController,
	parseClickV2Shift,
} from '../lib/zwift-click';
import type { ZwiftClickStore } from '../stores/zwift-click-store';

interface ClickRepeatTimer {
	delay: number;
	interval?: number;
}

const CLICK_HOLD_DELAY_MS = 600;
const CLICK_HOLD_REPEAT_MS = 220;
const CLICK_CONTROLLER_FLASH_MS = 350;
const CLICK_SHIFTS: ClickShift[] = [CLICK_SHIFT.DOWN, CLICK_SHIFT.UP];

export function useZwiftClickInput({
	identifyControllers,
	onOperational,
	onShift,
	store,
}: {
	identifyControllers: boolean;
	onOperational: (role: ClickShift) => void;
	onShift: (change: number) => void;
	store: ZwiftClickStore;
}) {
	const controllerFlashTimers = useRef(new Map<string, number>());
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
			const change = shift === CLICK_SHIFT.DOWN ? -1 : 1;
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
		(role: ClickShift, shift: ClickShift) => {
			if (!identifyControllersRef.current) {
				return;
			}
			window.clearTimeout(controllerFlashTimers.current.get(role));
			store.actions.activateController(role, shift);
			const timer = window.setTimeout(() => {
				controllerFlashTimers.current.delete(role);
				store.actions.deactivateController(role);
			}, CLICK_CONTROLLER_FLASH_MS);
			controllerFlashTimers.current.set(role, timer);
		},
		[store]
	);

	const handleControllerMessage = useCallback(
		(role: ClickShift, deviceId: string, event: Event) => {
			const { value } = event.target as BluetoothRemoteGATTCharacteristic;
			if (!value) {
				return;
			}
			const parsed = parseClickV2Shift(value, previousButtonMaps.current.get(deviceId));
			if (!parsed) {
				return;
			}
			onOperational(role);
			previousButtonMaps.current.set(deviceId, parsed.buttonMap);
			const heldShifts = filterClickShiftsForController(parsed.heldShifts, role);
			const controllerShifts = filterClickShiftsForController(parsed.shifts, role);
			setDeviceHeldShifts(deviceId, heldShifts);
			const acceptedShifts = filterAcceptedClickShifts(
				controllerShifts,
				performance.now(),
				lastShiftTimes.current
			);
			const activeShift = acceptedShifts.at(-1);
			if (activeShift) {
				flashController(role, activeShift);
			}
			for (const shift of acceptedShifts) {
				onShiftRef.current(shift === CLICK_SHIFT.DOWN ? -1 : 1);
			}
		},
		[flashController, onOperational, setDeviceHeldShifts]
	);

	const resetControllerInput = useCallback(
		(deviceId: string) => {
			previousButtonMaps.current.delete(deviceId);
			clearDeviceHeldShifts(deviceId);
		},
		[clearDeviceHeldShifts]
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
		handleControllerMessage,
		resetControllerInput,
	};
}
