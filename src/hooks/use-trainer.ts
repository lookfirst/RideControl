import { useCallback, useEffect, useRef, useState } from 'react';
import { CHROME_BLUETOOTH_PERMISSION_MESSAGE, emptyMetrics, optionalServices } from '../constants';
import { findRememberedKickr, recordMetricActivity, resistanceCommand } from '../lib/bluetooth';
import { type DeviceConnectionPhase, deviceConnectionView } from '../lib/device-connection';
import { scheduleNoticeDismissal } from '../lib/notification';
import { createReconnectController } from '../lib/reconnect-controller';
import {
	resistanceDirectionForKey,
	resistanceRampDuration,
	smoothedResistance,
} from '../lib/resistance';
import { storedResistance } from '../lib/session';
import { connectTrainerDevice } from '../lib/trainer-device';
import type { Metrics, Range, ResistanceAdjustmentDirection, ResistanceRamp } from '../types';

function pairingWasCancelled(error: unknown, connectionCancelled: boolean) {
	return connectionCancelled || (error instanceof DOMException && error.name === 'NotFoundError');
}

export function useTrainer() {
	const [device, setDevice] = useState<BluetoothDevice>();
	const [pairedDevice, setPairedDevice] = useState<BluetoothDevice>();
	const [controlPoint, setControlPoint] = useState<BluetoothRemoteGATTCharacteristic>();
	const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
	const [resistance, setResistance] = useState(storedResistance);
	const [resistanceKeyFlash, setResistanceKeyFlash] = useState<
		ResistanceAdjustmentDirection | undefined
	>();
	const [resistanceRamp, setResistanceRamp] = useState<ResistanceRamp>(() => {
		const current = storedResistance();
		return { current, from: current, phase: 'holding', progress: 0, to: current };
	});
	const [connectionPhase, setConnectionPhase] = useState<DeviceConnectionPhase>('unpaired');
	const [notice, setNotice] = useState('');
	const [resistanceRange, setResistanceRange] = useState<Range>({
		max: 100,
		min: 0,
	});
	const commandQueue = useRef(Promise.resolve());
	const resistanceTimer = useRef<number | undefined>(undefined);
	const resistanceRampTimer = useRef<number | undefined>(undefined);
	const resistanceKeyFlashTimer = useRef<number | undefined>(undefined);
	const appliedResistance = useRef(storedResistance());
	const resistanceTarget = useRef(storedResistance());
	const connecting = useRef(false);
	const connectionCancelled = useRef(false);
	const disconnectRequested = useRef(false);
	const autoReconnect = useRef(true);
	const pendingDevice = useRef<BluetoothDevice | undefined>(undefined);
	const connectionCleanup = useRef<() => void>(() => undefined);
	const connectDeviceRef = useRef<
		((selected: BluetoothDevice, rediscover?: boolean) => Promise<boolean>) | undefined
	>(undefined);
	const keyboardControlsEnabled = useRef(true);
	const gearControlsEnabled = useRef(false);
	const unloading = useRef(false);
	const lastPedalingAt = useRef(0);
	const trainerReportsDistance = useRef(false);
	const controlPointRef = useRef(controlPoint);
	const rangeRef = useRef(resistanceRange);
	const connection = deviceConnectionView(connectionPhase);
	const reconnectController = useRef(
		createReconnectController<BluetoothDevice>({
			attempt: (selected) =>
				connectDeviceRef.current?.(selected, true) ?? Promise.resolve(false),
			canRetry: () =>
				autoReconnect.current && !unloading.current && !connectionCancelled.current,
			delayForAttempt: (attempt) => Math.min(5000, 700 * attempt),
			onWaiting: () => setConnectionPhase('reconnecting'),
		})
	);

	useEffect(() => {
		controlPointRef.current = controlPoint;
	}, [controlPoint]);

	useEffect(() => {
		rangeRef.current = resistanceRange;
	}, [resistanceRange]);

	useEffect(() => scheduleNoticeDismissal(notice, () => setNotice('')), [notice]);

	useEffect(
		() => () => {
			window.clearTimeout(resistanceTimer.current);
			window.clearTimeout(resistanceRampTimer.current);
			window.clearTimeout(resistanceKeyFlashTimer.current);
		},
		[]
	);

	const writeControl = useCallback(
		async (characteristic: BluetoothRemoteGATTCharacteristic | undefined, bytes: number[]) => {
			if (!characteristic) {
				setNotice('Connect the trainer before changing its settings.');
				return;
			}
			const action = async () => {
				try {
					await characteristic.writeValueWithResponse(new Uint8Array(bytes));
				} catch (error) {
					setNotice(
						`Trainer command failed: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			};
			commandQueue.current = commandQueue.current.then(action, action);
			await commandQueue.current;
		},
		[]
	);

	function connectionStopped(rediscover: boolean) {
		return connectionCancelled.current || (rediscover && !autoReconnect.current);
	}

	function handleConnectionError(error: unknown, rediscover: boolean) {
		if (rediscover && autoReconnect.current && !connectionCancelled.current) {
			setConnectionPhase('reconnecting');
		} else if (connectionCancelled.current) {
			setConnectionPhase('offline');
		} else {
			setConnectionPhase('offline');
			setNotice(error instanceof Error ? error.message : String(error));
		}
	}

	function handleTrainerDisconnected(selected: BluetoothDevice) {
		const shouldReconnect =
			!(disconnectRequested.current || unloading.current) && autoReconnect.current;
		disconnectRequested.current = false;
		setDevice(undefined);
		setControlPoint(undefined);
		setMetrics(emptyMetrics);
		lastPedalingAt.current = 0;
		trainerReportsDistance.current = false;
		if (shouldReconnect) {
			pendingDevice.current = selected;
			setConnectionPhase('reconnecting');
			setNotice('Trainer disconnected. Reconnecting automatically…');
			reconnectController.current.start(selected.id, selected, 700);
		} else if (connectionCancelled.current) {
			setConnectionPhase(pairedDevice ? 'offline' : 'unpaired');
			setNotice('Connection attempt stopped.');
		} else {
			setConnectionPhase('offline');
			setNotice('Trainer disconnected.');
		}
	}

	async function connectDevice(selected: BluetoothDevice, rediscover = false): Promise<boolean> {
		if (connecting.current) {
			return false;
		}
		connecting.current = true;
		setConnectionPhase(rediscover ? 'reconnecting' : 'connecting');
		connectionCleanup.current();
		try {
			setPairedDevice(selected);
			const nextConnection = await connectTrainerDevice(
				selected,
				rediscover,
				resistanceRange,
				{
					onControlRejected: () => setNotice('Trainer did not accept that command.'),
					onDisconnect: () => {
						connectionCleanup.current();
						handleTrainerDisconnected(selected);
					},
					onMetrics: (nextMetrics, reportsDistance) => {
						if (reportsDistance) {
							trainerReportsDistance.current = true;
						}
						recordMetricActivity(lastPedalingAt, nextMetrics);
						setMetrics((current) => ({ ...current, ...nextMetrics }));
					},
				}
			);
			if (connectionStopped(rediscover)) {
				nextConnection.cleanup();
				selected.gatt?.disconnect();
				return false;
			}
			connectionCleanup.current = nextConnection.cleanup;
			const point = nextConnection.controlPoint;
			setControlPoint(point);
			const activeRange = nextConnection.resistanceRange;
			setResistanceRange(activeRange);
			const restored = storedResistance();
			setResistance(restored);
			appliedResistance.current = restored;
			resistanceTarget.current = restored;
			setResistanceRamp({
				current: restored,
				from: restored,
				phase: 'holding',
				progress: 0,
				to: restored,
			});
			await writeControl(point, [0]);
			await new Promise((resolve) => window.setTimeout(resolve, 150));
			await writeControl(point, resistanceCommand(restored, activeRange));
			if (connectionStopped(rediscover)) {
				selected.gatt?.disconnect();
				return false;
			}
			localStorage.setItem('trainer-device-id', selected.id);
			setDevice(selected);
			setConnectionPhase('connected');
			reconnectController.current.reset(selected.id);
			setNotice(`${selected.name ?? 'Trainer'} is connected and ready.`);
			return true;
		} catch (error) {
			if (selected.gatt?.connected) {
				selected.gatt.disconnect();
			}
			handleConnectionError(error, rediscover);
			return false;
		} finally {
			connecting.current = false;
		}
	}

	useEffect(() => {
		connectDeviceRef.current = connectDevice;
	});

	async function connect() {
		if (!navigator.bluetooth) {
			setNotice('Web Bluetooth requires current Chrome or Edge on localhost or HTTPS.');
			return;
		}
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		setConnectionPhase('pairing');
		try {
			const selected = await navigator.bluetooth.requestDevice({
				filters: [{ namePrefix: 'KICKR' }],
				optionalServices,
			});
			pendingDevice.current = selected;
			setPairedDevice(selected);
			autoReconnect.current = true;
			if (!(await connectDevice(selected))) {
				reconnectController.current.start(selected.id, selected);
			}
		} catch (error) {
			setConnectionPhase(pairedDevice ? 'offline' : 'unpaired');
			if (!pairingWasCancelled(error, connectionCancelled.current)) {
				setNotice(error instanceof Error ? error.message : String(error));
			}
		} finally {
			pendingDevice.current = undefined;
		}
	}

	const cancelConnection = useCallback(() => {
		connectionCancelled.current = true;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		pendingDevice.current?.gatt?.disconnect();
		pendingDevice.current = undefined;
		setConnectionPhase(pairedDevice ? 'offline' : 'unpaired');
		setNotice('Connection attempt stopped.');
	}, [pairedDevice]);

	const disconnect = useCallback(() => {
		connectionCancelled.current = false;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		device?.gatt?.disconnect();
		setDevice(undefined);
		setControlPoint(undefined);
		setMetrics(emptyMetrics);
		setConnectionPhase(pairedDevice ? 'offline' : 'unpaired');
	}, [device, pairedDevice]);

	async function reconnect() {
		if (!pairedDevice) {
			return;
		}
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		autoReconnect.current = true;
		reconnectController.current.reset(pairedDevice.id);
		if (!(await connectDevice(pairedDevice, true))) {
			reconnectController.current.start(pairedDevice.id, pairedDevice);
		}
	}

	const forget = useCallback(async () => {
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		device?.gatt?.disconnect();
		try {
			await pairedDevice?.forget();
		} finally {
			localStorage.removeItem('trainer-device-id');
			setDevice(undefined);
			setPairedDevice(undefined);
			setControlPoint(undefined);
			setMetrics(emptyMetrics);
			setConnectionPhase('unpaired');
			setNotice('Trainer removed from paired devices.');
		}
	}, [device, pairedDevice]);

	const sendResistance = useCallback(
		async (percent: number) => {
			await writeControl(
				controlPointRef.current,
				resistanceCommand(percent, rangeRef.current)
			);
		},
		[writeControl]
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
				const progress = Math.min(1, (performance.now() - startedAt) / duration);
				const current = smoothedResistance(start, target, progress);
				appliedResistance.current = current;
				setResistanceRamp({
					current,
					from: start,
					phase: progress < 1 ? 'ramping' : 'settled',
					progress,
					to: target,
				});
				sendResistance(current).catch((error: unknown) =>
					setNotice(error instanceof Error ? error.message : String(error))
				);
				if (progress < 1) {
					resistanceRampTimer.current = window.setTimeout(advance, 200);
				}
			};
			advance();
		},
		[sendResistance]
	);

	const updateResistance = useCallback(
		(value: number) => {
			const next = Math.max(0, Math.min(100, value));
			resistanceTarget.current = next;
			setResistance(next);
			localStorage.setItem('trainer-resistance-percent', String(next));
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
		[rampResistance]
	);

	const shiftResistanceBy = useCallback(
		(change: number) => {
			const next = Math.max(0, Math.min(100, resistanceTarget.current + change));
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
			localStorage.setItem('trainer-resistance-percent', String(next));
			sendResistance(next).catch((error: unknown) =>
				setNotice(error instanceof Error ? error.message : String(error))
			);
		},
		[sendResistance]
	);

	useEffect(() => {
		const handlePageHide = () => {
			unloading.current = true;
			autoReconnect.current = false;
			disconnectRequested.current = true;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
			device?.gatt?.disconnect();
		};
		window.addEventListener('pagehide', handlePageHide);
		return () => window.removeEventListener('pagehide', handlePageHide);
	}, [device]);

	useEffect(() => {
		let cancelled = false;
		async function restore() {
			autoReconnect.current = true;
			connectionCancelled.current = false;
			disconnectRequested.current = false;
			if (!navigator.bluetooth?.getDevices) {
				setConnectionPhase('unpaired');
				setNotice(CHROME_BLUETOOTH_PERMISSION_MESSAGE);
				return;
			}
			const remembered = await findRememberedKickr();
			if (cancelled) {
				return;
			}
			if (!remembered) {
				setConnectionPhase('unpaired');
				return;
			}
			setPairedDevice(remembered);
			setConnectionPhase('reconnecting');
			reconnectController.current.start(remembered.id, remembered, 1);
		}
		restore().catch((error: unknown) =>
			setNotice(error instanceof Error ? error.message : String(error))
		);
		return () => {
			cancelled = true;
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
		};
	}, []);

	useEffect(() => {
		const handleKeys = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const isResistanceControl = target?.matches('[data-resistance-control="true"]');
			if (
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				(!isResistanceControl &&
					target?.matches("input, textarea, select, [contenteditable='true']"))
			) {
				return;
			}
			if (!keyboardControlsEnabled.current) {
				return;
			}
			if (gearControlsEnabled.current) {
				return;
			}
			const direction = resistanceDirectionForKey(event.key);
			if (!direction) {
				return;
			}
			event.preventDefault();
			setResistanceKeyFlash(direction);
			window.clearTimeout(resistanceKeyFlashTimer.current);
			if (direction === 'increase') {
				updateResistance(resistanceTarget.current + 1);
			} else {
				updateResistance(resistanceTarget.current - 1);
			}
		};
		const handleKeyUp = (event: KeyboardEvent) => {
			if (!resistanceDirectionForKey(event.key)) {
				return;
			}
			window.clearTimeout(resistanceKeyFlashTimer.current);
			resistanceKeyFlashTimer.current = window.setTimeout(
				() => setResistanceKeyFlash(undefined),
				180
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
	}, [updateResistance]);

	const setKeyboardControlsEnabled = useCallback((enabled: boolean) => {
		keyboardControlsEnabled.current = enabled;
	}, []);

	const setGearControlsEnabled = useCallback((enabled: boolean) => {
		gearControlsEnabled.current = enabled;
	}, []);

	return {
		...connection,
		cancelConnection,
		connect,
		connectionBusy: connection.busy,
		deviceName: device?.name,
		disconnect,
		forget,
		lastPedalingAt,
		metrics,
		notice,
		pairedDeviceName: pairedDevice?.name,
		reconnect,
		resistance,
		resistanceKeyFlash,
		resistanceRamp,
		setGearControlsEnabled,
		setKeyboardControlsEnabled,
		setNotice,
		shiftResistanceBy,
		trainerReportsDistance,
		updateResistance,
	};
}
