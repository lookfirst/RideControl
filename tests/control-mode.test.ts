import { describe, expect, test } from 'bun:test';
import {
	CONTROL_MODE,
	trainingControlMode,
	virtualShiftingConnectionReady,
} from '../src/lib/control-mode';

describe('training control mode', () => {
	test('uses virtual gears for Click or terrain workouts', () => {
		expect(trainingControlMode(true, false)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(false, true)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(true, true)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(false, false)).toBe(CONTROL_MODE.RESISTANCE);
	});

	test('enables virtual shifting without waiting for every Click controller', () => {
		for (const [clickPairedCount, clickConnectedCount] of [
			[0, 0],
			[1, 0],
			[2, 0],
			[2, 1],
			[2, 2],
		]) {
			expect(
				virtualShiftingConnectionReady({
					clickConnectedCount,
					clickPairedCount,
					trainerConnected: true,
				})
			).toBeTrue();
		}
		expect(
			virtualShiftingConnectionReady({
				clickConnectedCount: 2,
				clickPairedCount: 2,
				trainerConnected: false,
			})
		).toBeFalse();
	});
});
