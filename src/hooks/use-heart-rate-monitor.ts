import { useCallback, useEffect, useRef, useState } from 'react';
import { BATTERY, HEART_RATE } from '../constants';
import { parseHeartRateMeasurement } from '../lib/heart-rate';

const HEART_RATE_MEASUREMENT = 0x2a_37;
const BATTERY_LEVEL = 0x2a_19;
const STORAGE_KEY = 'heart-rate-device-id';

export function useHeartRateMonitor(setNotice: (notice: string) => void) {
	const [device, setDevice] = useState<BluetoothDevice>();
	const [connected, setConnected] = useState(false);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState('Not paired');
	const [heartRate, setHeartRate] = useState(0);
	const [battery, setBattery] = useState<number>();
	const autoReconnect = useRef(true);
	const connecting = useRef(false);
	const forgotten = useRef(false);
	const connectDeviceRef = useRef<((selected: BluetoothDevice) => Promise<boolean>) | undefined>(
		undefined
	);

	const connectDevice = useCallback(
		async (selected: BluetoothDevice): Promise<boolean> => {
			if (forgotten.current || connecting.current) {
				return false;
			}
			connecting.current = true;
			setBusy(true);
			setStatus('Connecting…');
			try {
				const server = await selected.gatt?.connect();
				if (!server) {
					throw new Error('This heart rate monitor does not expose Bluetooth services.');
				}
				const service = await server.getPrimaryService(HEART_RATE);
				const measurement = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
				measurement.addEventListener('characteristicvaluechanged', (event) => {
					const { value } = event.target as BluetoothRemoteGATTCharacteristic;
					if (!value) {
						return;
					}
					const next = parseHeartRateMeasurement(value);
					if (next !== undefined) {
						setHeartRate(next);
					}
				});
				await measurement.startNotifications();
				try {
					const batteryValue = await (
						await (
							await server.getPrimaryService(BATTERY)
						).getCharacteristic(BATTERY_LEVEL)
					).readValue();
					setBattery(batteryValue.getUint8(0));
				} catch {
					setBattery(undefined);
				}
				selected.addEventListener(
					'gattserverdisconnected',
					() => {
						setConnected(false);
						setHeartRate(0);
						setStatus('Paired · offline');
						if (autoReconnect.current && !forgotten.current) {
							window.setTimeout(() => connectDeviceRef.current?.(selected), 900);
						}
					},
					{ once: true }
				);
				setDevice(selected);
				setConnected(true);
				setStatus('Connected');
				localStorage.setItem(STORAGE_KEY, selected.id);
				return true;
			} catch (error) {
				selected.gatt?.disconnect();
				setConnected(false);
				setStatus('Paired · offline');
				setNotice(
					`Heart rate monitor connection failed: ${error instanceof Error ? error.message : String(error)}`
				);
				return false;
			} finally {
				connecting.current = false;
				setBusy(false);
			}
		},
		[setNotice]
	);

	useEffect(() => {
		connectDeviceRef.current = connectDevice;
	}, [connectDevice]);

	const pair = useCallback(async () => {
		if (!navigator.bluetooth) {
			setNotice('Web Bluetooth requires current Chrome or Edge on localhost or HTTPS.');
			return;
		}
		try {
			const selected = await navigator.bluetooth.requestDevice({
				filters: [{ services: [HEART_RATE] }],
				optionalServices: [BATTERY],
			});
			autoReconnect.current = true;
			forgotten.current = false;
			setDevice(selected);
			localStorage.setItem(STORAGE_KEY, selected.id);
			await connectDevice(selected);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
				setNotice(error instanceof Error ? error.message : String(error));
			}
		}
	}, [connectDevice, setNotice]);

	const reconnect = useCallback(async () => {
		if (!device) {
			return;
		}
		forgotten.current = false;
		autoReconnect.current = true;
		await connectDevice(device);
	}, [connectDevice, device]);

	const disconnect = useCallback(() => {
		autoReconnect.current = false;
		device?.gatt?.disconnect();
		setConnected(false);
		setHeartRate(0);
		setStatus(device ? 'Paired · offline' : 'Not paired');
	}, [device]);

	const forget = useCallback(async () => {
		autoReconnect.current = false;
		forgotten.current = true;
		device?.gatt?.disconnect();
		try {
			await device?.forget();
		} finally {
			localStorage.removeItem(STORAGE_KEY);
			setDevice(undefined);
			setConnected(false);
			setHeartRate(0);
			setBattery(undefined);
			setStatus('Not paired');
		}
	}, [device]);

	useEffect(() => {
		let cancelled = false;
		async function restore() {
			if (!navigator.bluetooth?.getDevices) {
				return;
			}
			const savedId = localStorage.getItem(STORAGE_KEY);
			if (!savedId) {
				return;
			}
			const remembered = (await navigator.bluetooth.getDevices()).find(
				(candidate) => candidate.id === savedId
			);
			if (!(remembered && !cancelled)) {
				return;
			}
			setDevice(remembered);
			setStatus('Paired · offline');
			forgotten.current = false;
			autoReconnect.current = true;
			await connectDevice(remembered);
		}
		restore().catch(() => setStatus('Paired · offline'));
		return () => {
			cancelled = true;
			autoReconnect.current = false;
		};
	}, [connectDevice]);

	return {
		battery,
		busy,
		connected,
		disconnect,
		forget,
		heartRate,
		name: device?.name,
		pair,
		paired: Boolean(device),
		reconnect,
		status,
	};
}
