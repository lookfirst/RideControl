import { useCallback, useEffect, useRef, useState } from 'react';
import {
	CHROME_BLUETOOTH_PERMISSION_MESSAGE,
	CONTROL_POINT,
	CSC_MEASUREMENT,
	CYCLING_POWER,
	CYCLING_POWER_MEASUREMENT,
	CYCLING_SPEED_AND_CADENCE,
	emptyMetrics,
	FITNESS_MACHINE,
	FITNESS_MACHINE_STATUS,
	INDOOR_BIKE_DATA,
	optionalServices,
	SUPPORTED_RESISTANCE_LEVEL_RANGE,
} from '../constants';
import {
	characteristicValue,
	connectGatt,
	findRememberedKickr,
	parseCrankCadence,
	parseIndoorBikeData,
	recordMetricActivity,
	recordPedaling,
	resistanceCommand,
} from '../lib/bluetooth';
import { storedResistance } from '../lib/session';
import type { Metrics, Range } from '../types';

export function useTrainer() {
	const [device, setDevice] = useState<BluetoothDevice>();
	const [controlPoint, setControlPoint] = useState<BluetoothRemoteGATTCharacteristic>();
	const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
	const [resistance, setResistance] = useState(storedResistance);
	const [status, setStatus] = useState('Ready to connect');
	const [notice, setNotice] = useState('');
	const [connectionBusy, setConnectionBusy] = useState(false);
	const [resistanceRange, setResistanceRange] = useState<Range>({
		max: 100,
		min: 0,
	});
	const commandQueue = useRef(Promise.resolve());
	const resistanceTimer = useRef<number | undefined>(undefined);
	const resistanceRampTimer = useRef<number | undefined>(undefined);
	const appliedResistance = useRef(storedResistance());
	const resistanceTarget = useRef(storedResistance());
	const connecting = useRef(false);
	const connectionCancelled = useRef(false);
	const disconnectRequested = useRef(false);
	const autoReconnect = useRef(true);
	const pendingDevice = useRef<BluetoothDevice | undefined>(undefined);
	const unloading = useRef(false);
	const lastCrank = useRef<{ revolutions: number; time: number } | undefined>(undefined);
	const lastPedalingAt = useRef(0);
	const trainerReportsDistance = useRef(false);
	const controlPointRef = useRef(controlPoint);
	const rangeRef = useRef(resistanceRange);
	const connected = Boolean(device?.gatt?.connected);

	useEffect(() => {
		controlPointRef.current = controlPoint;
	}, [controlPoint]);

	useEffect(() => {
		rangeRef.current = resistanceRange;
	}, [resistanceRange]);

	useEffect(() => {
		if (!notice) {
			return;
		}
		const timeout = window.setTimeout(() => setNotice(''), 30_000);
		return () => window.clearTimeout(timeout);
	}, [notice]);

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

	async function subscribeToPowerAndCadence(server: BluetoothRemoteGATTServer) {
		try {
			const measurement = await (
				await server.getPrimaryService(CYCLING_POWER)
			).getCharacteristic(CYCLING_POWER_MEASUREMENT);
			measurement.addEventListener('characteristicvaluechanged', (event) => {
				const value = characteristicValue(event);
				if (!value) {
					return;
				}
				const power = value.getInt16(2, true);
				recordPedaling(lastPedalingAt, power > 5);
				setMetrics((current) => ({ ...current, power }));
			});
			await measurement.startNotifications();
		} catch {
			// Indoor Bike Data is the normal path.
		}
		try {
			const measurement = await (
				await server.getPrimaryService(CYCLING_SPEED_AND_CADENCE)
			).getCharacteristic(CSC_MEASUREMENT);
			measurement.addEventListener('characteristicvaluechanged', (event) => {
				const value = characteristicValue(event);
				if (!value) {
					return;
				}
				const parsed = parseCrankCadence(value, lastCrank.current);
				if (parsed.current) {
					lastCrank.current = parsed.current;
				}
				if (parsed.cadence !== undefined) {
					recordPedaling(lastPedalingAt, parsed.cadence > 0);
					setMetrics((current) => ({
						...current,
						cadence: parsed.cadence ?? current.cadence,
					}));
				}
			});
			await measurement.startNotifications();
		} catch {
			// CSC is optional.
		}
	}

	function connectionStopped(rediscover: boolean) {
		return connectionCancelled.current || (rediscover && !autoReconnect.current);
	}

	function handleConnectionError(error: unknown, rediscover: boolean) {
		if (rediscover && autoReconnect.current && !connectionCancelled.current) {
			setStatus('Reconnecting…');
		} else if (connectionCancelled.current) {
			setStatus('Ready to connect');
		} else {
			setStatus('Connection failed');
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
			setConnectionBusy(true);
			setStatus('Reconnecting…');
			setNotice('Trainer disconnected. Reconnecting automatically…');
			window.setTimeout(() => reconnectDevice(selected), 700);
		} else if (connectionCancelled.current) {
			setStatus('Ready to connect');
			setNotice('Connection attempt stopped.');
		} else {
			setStatus('Disconnected');
			setNotice('Trainer disconnected.');
		}
	}

	async function connectDevice(selected: BluetoothDevice, rediscover = false): Promise<boolean> {
		if (connecting.current) {
			return false;
		}
		connecting.current = true;
		try {
			const server = await connectGatt(selected, rediscover, setStatus);
			if (connectionStopped(rediscover)) {
				selected.gatt?.disconnect();
				return false;
			}
			const service = await server.getPrimaryService(FITNESS_MACHINE);
			const bikeData = await service.getCharacteristic(INDOOR_BIKE_DATA);
			bikeData.addEventListener('characteristicvaluechanged', (event) => {
				const value = characteristicValue(event);
				if (!value) {
					return;
				}
				const parsed = parseIndoorBikeData(value);
				if (parsed.reportsDistance) {
					trainerReportsDistance.current = true;
				}
				recordMetricActivity(lastPedalingAt, parsed.metrics);
				setMetrics((current) => ({ ...current, ...parsed.metrics }));
			});
			await bikeData.startNotifications();
			const point = await service.getCharacteristic(CONTROL_POINT);
			point.addEventListener('characteristicvaluechanged', (event) => {
				const value = characteristicValue(event);
				if (value?.getUint8(0) === 0x80 && value.getUint8(2) !== 0x01) {
					setNotice('Trainer did not accept that command.');
				}
			});
			await point.startNotifications();
			setControlPoint(point);
			try {
				await (
					await service.getCharacteristic(FITNESS_MACHINE_STATUS)
				).startNotifications();
			} catch {
				// Optional characteristic.
			}
			let activeRange = resistanceRange;
			try {
				const rangeValue = await (
					await service.getCharacteristic(SUPPORTED_RESISTANCE_LEVEL_RANGE)
				).readValue();
				activeRange = {
					max: rangeValue.getInt16(2, true) / 10,
					min: rangeValue.getInt16(0, true) / 10,
				};
				setResistanceRange(activeRange);
			} catch {
				// Use the generic range.
			}
			const restored = storedResistance();
			setResistance(restored);
			appliedResistance.current = restored;
			resistanceTarget.current = restored;
			await writeControl(point, [0]);
			await new Promise((resolve) => window.setTimeout(resolve, 150));
			await writeControl(point, resistanceCommand(restored, activeRange));
			if (connectionStopped(rediscover)) {
				selected.gatt?.disconnect();
				return false;
			}
			selected.addEventListener(
				'gattserverdisconnected',
				() => handleTrainerDisconnected(selected),
				{ once: true }
			);
			localStorage.setItem('trainer-device-id', selected.id);
			setDevice(selected);
			setStatus('Connected');
			setNotice(`${selected.name ?? 'Trainer'} is connected and ready.`);
			subscribeToPowerAndCadence(server).catch((error: unknown) =>
				setNotice(error instanceof Error ? error.message : String(error))
			);
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

	async function reconnectDevice(selected: BluetoothDevice) {
		if (!autoReconnect.current || unloading.current || connectionCancelled.current) {
			return;
		}
		pendingDevice.current = selected;
		setConnectionBusy(true);
		let attempt = 0;
		try {
			while (autoReconnect.current && !unloading.current && !connectionCancelled.current) {
				if (await connectDevice(selected, true)) {
					return;
				}
				if (!autoReconnect.current || unloading.current || connectionCancelled.current) {
					return;
				}
				attempt += 1;
				setStatus('Reconnecting…');
				await new Promise((resolve) =>
					window.setTimeout(resolve, Math.min(5000, 700 * attempt))
				);
			}
		} finally {
			pendingDevice.current = undefined;
			setConnectionBusy(false);
		}
	}

	async function connect() {
		if (!navigator.bluetooth) {
			setNotice('Web Bluetooth requires current Chrome or Edge on localhost or HTTPS.');
			return;
		}
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		setConnectionBusy(true);
		try {
			setStatus('Choose a trainer…');
			const selected = await navigator.bluetooth.requestDevice({
				filters: [{ namePrefix: 'KICKR' }],
				optionalServices,
			});
			pendingDevice.current = selected;
			autoReconnect.current = true;
			await connectDevice(selected);
		} catch (error) {
			if (
				connectionCancelled.current ||
				(error instanceof DOMException && error.name === 'NotFoundError')
			) {
				setStatus('Ready to connect');
			} else {
				setStatus('Connection failed');
				setNotice(error instanceof Error ? error.message : String(error));
			}
		} finally {
			pendingDevice.current = undefined;
			setConnectionBusy(false);
		}
	}

	const cancelConnection = useCallback(() => {
		connectionCancelled.current = true;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		pendingDevice.current?.gatt?.disconnect();
		pendingDevice.current = undefined;
		setConnectionBusy(false);
		setStatus('Ready to connect');
		setNotice('Connection attempt stopped.');
	}, []);

	const disconnect = useCallback(() => {
		connectionCancelled.current = false;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		device?.gatt?.disconnect();
	}, [device]);

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
			const startedAt = performance.now();
			const duration = Math.max(600, Math.min(3000, Math.abs(target - start) * 45));
			const advance = () => {
				const progress = Math.min(1, (performance.now() - startedAt) / duration);
				const eased = progress * progress * (3 - 2 * progress);
				const current = start + (target - start) * eased;
				appliedResistance.current = current;
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
			resistanceTimer.current = window.setTimeout(() => {
				rampResistance(next);
			}, 180);
		},
		[rampResistance]
	);

	useEffect(() => {
		const handlePageHide = () => {
			unloading.current = true;
			autoReconnect.current = false;
			disconnectRequested.current = true;
			device?.gatt?.disconnect();
		};
		window.addEventListener('pagehide', handlePageHide);
		return () => window.removeEventListener('pagehide', handlePageHide);
	}, [device]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Permission restoration is a one-time mount operation.
	useEffect(() => {
		let cancelled = false;
		async function restore() {
			autoReconnect.current = true;
			connectionCancelled.current = false;
			disconnectRequested.current = false;
			if (!navigator.bluetooth?.getDevices) {
				setStatus('Browser setup required');
				setNotice(CHROME_BLUETOOTH_PERMISSION_MESSAGE);
				return;
			}
			const remembered = await findRememberedKickr();
			if (cancelled) {
				return;
			}
			if (!remembered) {
				setStatus('Ready to connect');
				return;
			}
			setStatus('Reconnecting…');
			await reconnectDevice(remembered);
		}
		restore().catch((error: unknown) =>
			setNotice(error instanceof Error ? error.message : String(error))
		);
		return () => {
			cancelled = true;
			autoReconnect.current = false;
		};
	}, []);

	useEffect(() => {
		const handleKeys = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				target?.matches("input, textarea, select, [contenteditable='true']")
			) {
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				updateResistance(resistanceTarget.current + 1);
			} else if (event.key === 'ArrowDown') {
				event.preventDefault();
				updateResistance(resistanceTarget.current - 1);
			}
		};
		window.addEventListener('keydown', handleKeys);
		return () => window.removeEventListener('keydown', handleKeys);
	}, [updateResistance]);

	return {
		cancelConnection,
		connect,
		connected,
		connectionBusy,
		deviceName: device?.name,
		disconnect,
		lastPedalingAt,
		metrics,
		notice,
		resistance,
		setNotice,
		status,
		trainerReportsDistance,
		updateResistance,
	};
}
