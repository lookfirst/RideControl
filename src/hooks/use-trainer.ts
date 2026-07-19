import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CONTROL_FLASH_MS } from '../constants';
import { deviceConnectionView } from '../lib/device-connection';
import { eventTargetsEditableControl, keyboardEventHasModifiers } from '../lib/dom';
import { errorMessage } from '../lib/errors';
import { scheduleNoticeDismissal } from '../lib/notification';
import { clamp } from '../lib/numbers';
import {
	clampResistance,
	resistanceDirectionForKey,
	resistanceRampDuration,
	smoothedResistance,
} from '../lib/resistance';
import { RESISTANCE_STORAGE_KEY } from '../lib/session';
import { createTrainerStore } from '../stores/trainer-store';
import { useTrainerConnection } from './use-trainer-connection';

export function useTrainer() {
	const store = useMemo(() => createTrainerStore(), []);
	const state = useSelector(store);
	const { setNotice, setResistance, setResistanceKeyFlash, setResistanceRamp } = store.actions;
	const resistanceTimer = useRef<number | undefined>(undefined);
	const resistanceRampTimer = useRef<number | undefined>(undefined);
	const resistanceKeyFlashTimer = useRef<number | undefined>(undefined);
	const appliedResistance = useRef(store.get().resistance);
	const resistanceTarget = useRef(store.get().resistance);
	const keyboardControlsEnabled = useRef(true);
	const gearControlsEnabled = useRef(false);
	const trainerConnection = useTrainerConnection(store, appliedResistance, resistanceTarget);
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

	const updateResistance = useCallback(
		(value: number) => {
			const next = clampResistance(value);
			resistanceTarget.current = next;
			setResistance(next);
			localStorage.setItem(RESISTANCE_STORAGE_KEY, String(next));
			window.clearTimeout(resistanceTimer.current);
			window.clearTimeout(resistanceRampTimer.current);
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

	const shiftResistanceBy = useCallback(
		(change: number) => {
			const next = clampResistance(resistanceTarget.current + change);
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
			localStorage.setItem(RESISTANCE_STORAGE_KEY, String(next));
			trainerConnection
				.sendResistance(next)
				.catch((error: unknown) => setNotice(errorMessage(error)));
		},
		[setNotice, setResistance, setResistanceRamp, trainerConnection.sendResistance]
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
		setGearControlsEnabled,
		setKeyboardControlsEnabled,
		setNotice,
		shiftResistanceBy,
		trainerReportsDistance: trainerConnection.trainerReportsDistance,
		updateResistance,
	};
}
