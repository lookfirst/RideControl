import { useCallback, useEffect, useRef } from 'react';
import {
	CHROME_BLUETOOTH_PERMISSION_MESSAGE,
	emptyMetrics,
	optionalServices,
	WEB_BLUETOOTH_UNAVAILABLE_MESSAGE,
} from '../constants';
import {
	findRememberedKickr,
	isBluetoothChooserCancellation,
	recordMetricActivity,
	resistanceCommand,
	TRAINER_DEVICE_STORAGE_KEY,
} from '../lib/bluetooth';
import { errorMessage } from '../lib/errors';
import { createReconnectController } from '../lib/reconnect-controller';
import { storedResistance } from '../lib/session';
import { connectTrainerDevice } from '../lib/trainer-device';
import type { TrainerStore } from '../stores/trainer-store';

interface NumberRef {
	current: number;
}

function pairingWasCancelled(error: unknown, connectionCancelled: boolean) {
	return connectionCancelled || isBluetoothChooserCancellation(error);
}

export function useTrainerConnection(
	store: TrainerStore,
	appliedResistance: NumberRef,
	resistanceTarget: NumberRef
) {
	const { setConnectionPhase, setMetrics, setNotice, setResistance, setResistanceRamp } =
		store.actions;
	const device = useRef<BluetoothDevice | undefined>(undefined);
	const pairedDevice = useRef<BluetoothDevice | undefined>(undefined);
	const commandQueue = useRef(Promise.resolve());
	const connecting = useRef(false);
	const connectionCancelled = useRef(false);
	const disconnectRequested = useRef(false);
	const autoReconnect = useRef(true);
	const pendingDevice = useRef<BluetoothDevice | undefined>(undefined);
	const connectionCleanup = useRef<() => void>(() => undefined);
	const connectDeviceRef = useRef<
		((selected: BluetoothDevice, rediscover?: boolean) => Promise<boolean>) | undefined
	>(undefined);
	const unloading = useRef(false);
	const lastPedalingAt = useRef(0);
	const trainerReportsDistance = useRef(false);
	const controlPoint = useRef<BluetoothRemoteGATTCharacteristic | undefined>(undefined);
	const resistanceRange = useRef(store.get().resistanceRange);
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
					setNotice(`Trainer command failed: ${errorMessage(error)}`);
				}
			};
			commandQueue.current = commandQueue.current.then(action, action);
			await commandQueue.current;
		},
		[setNotice]
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
			setNotice(errorMessage(error));
		}
	}

	function handleTrainerDisconnected(selected: BluetoothDevice) {
		const shouldReconnect =
			!(disconnectRequested.current || unloading.current) && autoReconnect.current;
		disconnectRequested.current = false;
		device.current = undefined;
		store.actions.setDeviceName(undefined);
		controlPoint.current = undefined;
		setMetrics(emptyMetrics);
		lastPedalingAt.current = 0;
		trainerReportsDistance.current = false;
		if (shouldReconnect) {
			pendingDevice.current = selected;
			setConnectionPhase('reconnecting');
			setNotice('Trainer disconnected. Reconnecting automatically…');
			reconnectController.current.start(selected.id, selected, 700);
		} else if (connectionCancelled.current) {
			setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
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
			pairedDevice.current = selected;
			store.actions.setPairedDeviceName(selected.name);
			const nextConnection = await connectTrainerDevice(
				selected,
				rediscover,
				resistanceRange.current,
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
						store.actions.mergeMetrics(nextMetrics);
					},
				}
			);
			if (connectionStopped(rediscover)) {
				nextConnection.cleanup();
				selected.gatt?.disconnect();
				return false;
			}
			connectionCleanup.current = nextConnection.cleanup;
			controlPoint.current = nextConnection.controlPoint;
			resistanceRange.current = nextConnection.resistanceRange;
			store.actions.setResistanceRange(nextConnection.resistanceRange);
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
			await writeControl(controlPoint.current, [0]);
			await new Promise((resolve) => window.setTimeout(resolve, 150));
			await writeControl(
				controlPoint.current,
				resistanceCommand(restored, resistanceRange.current)
			);
			if (connectionStopped(rediscover)) {
				selected.gatt?.disconnect();
				return false;
			}
			localStorage.setItem(TRAINER_DEVICE_STORAGE_KEY, selected.id);
			device.current = selected;
			store.actions.setDeviceName(selected.name);
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
			setNotice(WEB_BLUETOOTH_UNAVAILABLE_MESSAGE);
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
			pairedDevice.current = selected;
			store.actions.setPairedDeviceName(selected.name);
			autoReconnect.current = true;
			if (!(await connectDevice(selected))) {
				reconnectController.current.start(selected.id, selected);
			}
		} catch (error) {
			setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
			if (!pairingWasCancelled(error, connectionCancelled.current)) {
				setNotice(errorMessage(error));
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
		setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
		setNotice('Connection attempt stopped.');
	}, [setConnectionPhase, setNotice]);

	const disconnect = useCallback(() => {
		connectionCancelled.current = false;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		device.current?.gatt?.disconnect();
		device.current = undefined;
		store.actions.setDeviceName(undefined);
		controlPoint.current = undefined;
		setMetrics(emptyMetrics);
		setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
	}, [setConnectionPhase, setMetrics, store]);

	async function reconnect() {
		if (!pairedDevice.current) {
			return;
		}
		const selected = pairedDevice.current;
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		autoReconnect.current = true;
		reconnectController.current.reset(selected.id);
		if (!(await connectDevice(selected, true))) {
			reconnectController.current.start(selected.id, selected);
		}
	}

	const forget = useCallback(async () => {
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		device.current?.gatt?.disconnect();
		try {
			await pairedDevice.current?.forget();
		} finally {
			localStorage.removeItem(TRAINER_DEVICE_STORAGE_KEY);
			device.current = undefined;
			pairedDevice.current = undefined;
			store.actions.setDeviceName(undefined);
			store.actions.setPairedDeviceName(undefined);
			controlPoint.current = undefined;
			setMetrics(emptyMetrics);
			setConnectionPhase('unpaired');
			setNotice('Trainer removed from paired devices.');
		}
	}, [setConnectionPhase, setMetrics, setNotice, store]);

	const sendResistance = useCallback(
		async (percent: number) => {
			await writeControl(
				controlPoint.current,
				resistanceCommand(percent, resistanceRange.current)
			);
		},
		[writeControl]
	);

	useEffect(() => {
		const handlePageHide = () => {
			unloading.current = true;
			autoReconnect.current = false;
			disconnectRequested.current = true;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
			device.current?.gatt?.disconnect();
		};
		window.addEventListener('pagehide', handlePageHide);
		return () => window.removeEventListener('pagehide', handlePageHide);
	}, []);

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
			pairedDevice.current = remembered;
			store.actions.setPairedDeviceName(remembered.name);
			setConnectionPhase('reconnecting');
			reconnectController.current.start(remembered.id, remembered, 1);
		}
		restore().catch((error: unknown) => setNotice(errorMessage(error)));
		return () => {
			cancelled = true;
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
		};
	}, [setConnectionPhase, setNotice, store.actions.setPairedDeviceName]);

	return {
		cancelConnection,
		connect,
		disconnect,
		forget,
		lastPedalingAt,
		reconnect,
		sendResistance,
		trainerReportsDistance,
	};
}
