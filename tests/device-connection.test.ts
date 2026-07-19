import { describe, expect, test } from 'bun:test';
import { startBluetoothNotifications } from '../src/lib/bluetooth-notifications';
import {
	aggregateConnectionPhase,
	deviceConnectionView,
	removeConnectionPhase,
	setConnectionPhase,
} from '../src/lib/device-connection';
import { createReconnectController } from '../src/lib/reconnect-controller';

describe('device connection state', () => {
	test('derives every public flag and label from one phase', () => {
		expect(deviceConnectionView('unpaired')).toEqual({
			busy: false,
			connected: false,
			paired: false,
			phase: 'unpaired',
			reconnecting: false,
			status: 'Not paired',
		});
		expect(deviceConnectionView('reconnecting')).toEqual({
			busy: true,
			connected: false,
			paired: true,
			phase: 'reconnecting',
			reconnecting: true,
			status: 'Reconnecting…',
		});
		expect(deviceConnectionView('connected').connected).toBeTrue();
	});

	test('aggregates independent controller phases without impossible states', () => {
		expect(aggregateConnectionPhase([])).toBe('unpaired');
		expect(aggregateConnectionPhase(['connected', 'connected'])).toBe('connected');
		expect(aggregateConnectionPhase(['connected', 'reconnecting'])).toBe('reconnecting');
		expect(aggregateConnectionPhase(['connected', 'connecting'])).toBe('connecting');
		expect(aggregateConnectionPhase(['connected', 'offline'])).toBe('offline');
	});

	test('updates keyed controller phases without publishing no-op changes', () => {
		const initial = { plus: 'connected' as const };
		expect(setConnectionPhase(initial, 'plus', 'connected')).toBe(initial);
		const withMinus = setConnectionPhase(initial, 'minus', 'reconnecting');
		expect(withMinus).toEqual({ minus: 'reconnecting', plus: 'connected' });
		expect(removeConnectionPhase(withMinus, 'minus')).toEqual({ plus: 'connected' });
	});
});

describe('reconnect controller', () => {
	test('retries until connected and then clears its pending work', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		let attempts = 0;
		const controller = createReconnectController<string>({
			attempt: () => {
				attempts += 1;
				return Promise.resolve(attempts === 2);
			},
			canRetry: () => true,
			clearTimer: () => undefined,
			delayForAttempt: (attempt) => attempt * 100,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});
		controller.start('device', 'target');
		expect(controller.isPending('device')).toBeTrue();
		await callbacks.shift()?.();
		expect(attempts).toBe(1);
		expect(controller.isPending('device')).toBeTrue();
		await callbacks.shift()?.();
		expect(attempts).toBe(2);
		expect(controller.isPending('device')).toBeFalse();
	});

	test('cancels retries and ignores duplicate scheduling', () => {
		const callbacks: Array<() => void> = [];
		const cleared: unknown[] = [];
		const controller = createReconnectController<string>({
			attempt: async () => false,
			canRetry: () => true,
			clearTimer: (timer) => cleared.push(timer),
			delayForAttempt: () => 100,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});
		controller.start('device', 'first');
		controller.start('device', 'second');
		expect(callbacks).toHaveLength(1);
		controller.cancel('device', true);
		expect(cleared).toEqual([1]);
		expect(controller.isPending('device')).toBeFalse();
	});

	test('schedules independent devices concurrently', () => {
		const callbacks: Array<() => void> = [];
		const controller = createReconnectController<string>({
			attempt: async () => true,
			canRetry: () => true,
			delayForAttempt: () => 100,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});
		controller.start('plus', 'plus');
		controller.start('minus', 'minus');
		expect(callbacks).toHaveLength(2);
		expect(controller.isPending('plus')).toBeTrue();
		expect(controller.isPending('minus')).toBeTrue();
	});
});

describe('Bluetooth notifications', () => {
	test('owns listener setup and cleanup', async () => {
		const listeners = new Set<EventListenerOrEventListenerObject>();
		const characteristic = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.add(listener),
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.delete(listener),
			startNotifications: async () => characteristic,
		} as unknown as BluetoothRemoteGATTCharacteristic;
		const cleanup = await startBluetoothNotifications(characteristic, () => undefined);
		expect(listeners.size).toBe(1);
		cleanup();
		expect(listeners.size).toBe(0);
	});

	test('removes a listener when notification setup fails', async () => {
		const listeners = new Set<EventListenerOrEventListenerObject>();
		const characteristic = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.add(listener),
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.delete(listener),
			startNotifications: () => Promise.reject(new Error('unavailable')),
		} as unknown as BluetoothRemoteGATTCharacteristic;
		await expect(startBluetoothNotifications(characteristic, () => undefined)).rejects.toThrow(
			'unavailable'
		);
		expect(listeners.size).toBe(0);
	});
});
