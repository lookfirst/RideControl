import { useCallback, useEffect, useRef } from 'react';
import {
	CHROME_BLUETOOTH_PERMISSION_MESSAGE,
	emptyMetrics,
	optionalServices,
	WEB_BLUETOOTH_UNAVAILABLE_MESSAGE,
} from '../constants';
import {
	isBluetoothChooserCancellation,
	recordMetricActivity,
	resistanceCommand,
	selectRememberedKickr,
	TRAINER_DEVICE_STORAGE_KEY,
} from '../lib/bluetooth';
import {
	createBluetoothReconnectController,
	reconnectBluetoothDeviceNow,
	scheduleBluetoothDeviceReconnect,
} from '../lib/bluetooth-reconnect';
import { errorMessage } from '../lib/errors';
import type { RememberedBluetoothDeviceCatalog } from '../lib/remembered-bluetooth-devices';
import { storedResistance } from '../lib/session';
import { connectTrainerDevice } from '../lib/trainer-device';
import type { TrainerStore } from '../stores/trainer-store';
import { usePageHide } from './use-page-hide';

interface NumberRef {
	current: number;
}

function pairingWasCancelled(error: unknown, connectionCancelled: boolean) {
	return connectionCancelled || isBluetoothChooserCancellation(error);
}

export function useTrainerConnection(
	store: TrainerStore,
	appliedResistance: NumberRef,
	resistanceTarget: NumberRef,
	rememberedDevices: RememberedBluetoothDeviceCatalog
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
		createBluetoothReconnectController<BluetoothDevice>({
			attempt: (selected) =>
				connectDeviceRef.current?.(selected, true) ?? Promise.resolve(false),
			canRetry: () =>
				autoReconnect.current && !unloading.current && !connectionCancelled.current,
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
			scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
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
			nextConnection.startOptionalMetrics();
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
				scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
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

	function reconnect() {
		if (!pairedDevice.current) {
			return;
		}
		const selected = pairedDevice.current;
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		autoReconnect.current = true;
		reconnectController.current.reset(selected.id);
		reconnectBluetoothDeviceNow(reconnectController.current, selected);
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

	usePageHide(() => {
		unloading.current = true;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		device.current?.gatt?.disconnect();
	});

	useEffect(() => {
		if (!rememberedDevices.supported) {
			setConnectionPhase('unpaired');
			setNotice(CHROME_BLUETOOTH_PERMISSION_MESSAGE);
			return;
		}
		if (rememberedDevices.error) {
			setConnectionPhase('offline');
			setNotice(errorMessage(rememberedDevices.error));
			return;
		}
		if (!rememberedDevices.devices) {
			return;
		}
		const remembered = selectRememberedKickr(rememberedDevices.devices);
		if (!remembered) {
			setConnectionPhase('unpaired');
			return;
		}
		autoReconnect.current = true;
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		pairedDevice.current = remembered;
		store.actions.setPairedDeviceName(remembered.name);
		setConnectionPhase('reconnecting');
		reconnectBluetoothDeviceNow(reconnectController.current, remembered);
		return () => {
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
		};
	}, [
		rememberedDevices.devices,
		rememberedDevices.error,
		rememberedDevices.supported,
		setConnectionPhase,
		setNotice,
		store.actions.setPairedDeviceName,
	]);

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
