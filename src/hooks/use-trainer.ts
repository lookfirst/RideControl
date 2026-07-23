import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CONTROL_FLASH_MS } from '../constants';
import { deviceConnectionView } from '../lib/device-connection';
import { eventTargetsEditableControl, keyboardEventHasModifiers } from '../lib/dom';
import { errorMessage } from '../lib/errors';
import { resistanceAfterGearShift } from '../lib/gears';
import { scheduleNoticeDismissal } from '../lib/notification';
import { clamp } from '../lib/numbers';
import type { VirtualDrivetrain } from '../lib/profile';
import type { RememberedBluetoothDeviceCatalog } from '../lib/remembered-bluetooth-devices';
import {
	clampResistance,
	DEFAULT_RESISTANCE,
	resistanceDirectionForKey,
	resistanceRampDuration,
	smoothedResistance,
} from '../lib/resistance';
import { RESISTANCE_STORAGE_KEY } from '../lib/session';
import { createTrainerStore } from '../stores/trainer-store';
import { useTrainerConnection } from './use-trainer-connection';

export function useTrainer(
	rememberedDevices: RememberedBluetoothDeviceCatalog,
	drivetrain: VirtualDrivetrain
) {
	const store = useMemo(() => createTrainerStore(), []);
	const state = useSelector(store);
	const { setNotice, setResistance, setResistanceKeyFlash, setResistanceRamp } = store.actions;
	const resistanceTimer = useRef<number | undefined>(undefined);
	const resistanceRampTimer = useRef<number | undefined>(undefined);
	const resistanceKeyFlashTimer = useRef<number | undefined>(undefined);
	const appliedResistance = useRef(store.get().resistance);
	const rememberedResistance = useRef(store.get().resistance);
	const resistanceTarget = useRef(store.get().resistance);
	const keyboardControlsEnabled = useRef(true);
	const gearControlsEnabled = useRef(false);
	const trainerConnection = useTrainerConnection(
		store,
		appliedResistance,
		resistanceTarget,
		rememberedDevices
	);
	const connection = deviceConnectionView(state.connectionPhase);

	useEffect(
		() => scheduleNoticeDismissal(state.notice, () => setNotice('')),
		[setNotice, state.notice]
	);

	useEffect(
		() => () => {
			window.clearTimeout(resistanceTimer.current);
			window.clearTimeout(resistanceRampTimer.current);
			window.clearTimeout(resistanceKeyFlashTimer.current);
		},
		[]
	);

	const rampResistance = useCallback(
		(target: number) => {
			window.clearTimeout(resistanceRampTimer.current);
			const start = appliedResistance.current;
			if (start === target) {
				setResistanceRamp({
					current: target,
					from: start,
					phase: 'settled',
					progress: 1,
					to: target,
				});
				return;
			}
			const startedAt = performance.now();
			const duration = resistanceRampDuration(start, target);
			setResistanceRamp({
				current: start,
				from: start,
				phase: 'ramping',
				progress: 0,
				to: target,
			});
			const advance = () => {
				const progress = clamp((performance.now() - startedAt) / duration, 0, 1);
				const current = smoothedResistance(start, target, progress);
				appliedResistance.current = current;
				setResistanceRamp({
					current,
					from: start,
					phase: progress < 1 ? 'ramping' : 'settled',
					progress,
					to: target,
				});
				trainerConnection
					.sendResistance(current)
					.catch((error: unknown) => setNotice(errorMessage(error)));
				if (progress < 1) {
					resistanceRampTimer.current = window.setTimeout(advance, 200);
				}
			};
			advance();
		},
		[setNotice, setResistanceRamp, trainerConnection.sendResistance]
	);

	const queueResistance = useCallback(
		(value: number, remember: boolean, applyToTrainer = true) => {
			const next = clampResistance(value);
			resistanceTarget.current = next;
			setResistance(next);
			if (remember) {
				rememberedResistance.current = next;
				localStorage.setItem(RESISTANCE_STORAGE_KEY, String(next));
			}
			window.clearTimeout(resistanceTimer.current);
			window.clearTimeout(resistanceRampTimer.current);
			if (!applyToTrainer) {
				appliedResistance.current = next;
				setResistanceRamp({
					current: next,
					from: next,
					phase: 'holding',
					progress: 0,
					to: next,
				});
				return;
			}
			const { current } = appliedResistance;
			setResistanceRamp({
				current,
				from: current,
				phase: current === next ? 'settled' : 'queued',
				progress: current === next ? 1 : 0,
				to: next,
			});
			resistanceTimer.current = window.setTimeout(() => {
				rampResistance(next);
			}, 180);
		},
		[rampResistance, setResistance, setResistanceRamp]
	);
	const updateResistance = useCallback(
		(value: number) => queueResistance(value, true),
		[queueResistance]
	);
	const updateProgramResistance = useCallback(
		(value: number) => queueResistance(value, false),
		[queueResistance]
	);
	const restoreManualResistance = useCallback(
		() => queueResistance(rememberedResistance.current, false),
		[queueResistance]
	);
	const settleAfterRide = useCallback(
		() => queueResistance(DEFAULT_RESISTANCE, true, connection.connected),
		[connection.connected, queueResistance]
	);

	const applyResistanceImmediately = useCallback(
		(value: number, remember: boolean) => {
			const next = clampResistance(value);
			window.clearTimeout(resistanceTimer.current);
			window.clearTimeout(resistanceRampTimer.current);
			resistanceTarget.current = next;
			appliedResistance.current = next;
			setResistance(next);
			setResistanceRamp({
				current: next,
				from: next,
				phase: 'settled',
				progress: 1,
				to: next,
			});
			if (remember) {
				rememberedResistance.current = next;
				localStorage.setItem(RESISTANCE_STORAGE_KEY, String(next));
			}
			trainerConnection
				.sendResistance(next)
				.catch((error: unknown) => setNotice(errorMessage(error)));
		},
		[setNotice, setResistance, setResistanceRamp, trainerConnection.sendResistance]
	);
	const shiftResistanceForGears = useCallback(
		(fromGear: number, toGear: number) => {
			applyResistanceImmediately(
				resistanceAfterGearShift(resistanceTarget.current, fromGear, toGear, drivetrain),
				true
			);
		},
		[applyResistanceImmediately, drivetrain]
	);
	const updateProgramShiftResistance = useCallback(
		(value: number) => applyResistanceImmediately(value, false),
		[applyResistanceImmediately]
	);

	useEffect(() => {
		const handleKeys = (event: KeyboardEvent) => {
			const isResistanceControl =
				event.target instanceof HTMLElement &&
				event.target.matches('[data-resistance-control="true"]');
			if (
				event.defaultPrevented ||
				keyboardEventHasModifiers(event) ||
				(!isResistanceControl && eventTargetsEditableControl(event)) ||
				!keyboardControlsEnabled.current ||
				gearControlsEnabled.current
			) {
				return;
			}
			const direction = resistanceDirectionForKey(event.key);
			if (!direction) {
				return;
			}
			event.preventDefault();
			setResistanceKeyFlash(direction);
			window.clearTimeout(resistanceKeyFlashTimer.current);
			updateResistance(resistanceTarget.current + (direction === 'increase' ? 1 : -1));
		};
		const handleKeyUp = (event: KeyboardEvent) => {
			if (!resistanceDirectionForKey(event.key)) {
				return;
			}
			window.clearTimeout(resistanceKeyFlashTimer.current);
			resistanceKeyFlashTimer.current = window.setTimeout(
				() => setResistanceKeyFlash(undefined),
				CONTROL_FLASH_MS
			);
		};
		const handleBlur = () => {
			window.clearTimeout(resistanceKeyFlashTimer.current);
			setResistanceKeyFlash(undefined);
		};
		window.addEventListener('keydown', handleKeys);
		window.addEventListener('keyup', handleKeyUp);
		window.addEventListener('blur', handleBlur);
		return () => {
			window.removeEventListener('keydown', handleKeys);
			window.removeEventListener('keyup', handleKeyUp);
			window.removeEventListener('blur', handleBlur);
		};
	}, [setResistanceKeyFlash, updateResistance]);

	const setKeyboardControlsEnabled = useCallback((enabled: boolean) => {
		keyboardControlsEnabled.current = enabled;
	}, []);

	const setGearControlsEnabled = useCallback((enabled: boolean) => {
		gearControlsEnabled.current = enabled;
	}, []);

	return {
		...connection,
		cancelConnection: trainerConnection.cancelConnection,
		connect: trainerConnection.connect,
		connectionBusy: connection.busy,
		deviceName: state.deviceName,
		disconnect: trainerConnection.disconnect,
		forget: trainerConnection.forget,
		lastPedalingAt: trainerConnection.lastPedalingAt,
		metrics: state.metrics,
		notice: state.notice,
		pairedDeviceName: state.pairedDeviceName,
		reconnect: trainerConnection.reconnect,
		resistance: state.resistance,
		resistanceKeyFlash: state.resistanceKeyFlash,
		resistanceRamp: state.resistanceRamp,
		restoreManualResistance,
		setGearControlsEnabled,
		setKeyboardControlsEnabled,
		setNotice,
		settleAfterRide,
		shiftResistanceForGears,
		trainerReportsDistance: trainerConnection.trainerReportsDistance,
		updateProgramResistance,
		updateProgramShiftResistance,
		updateResistance,
	};
}
