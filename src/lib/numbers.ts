import { isFiniteNumber } from './type-guards';

export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

export function nonNegativeNumber(value: unknown): number {
	return isFiniteNumber(value) ? Math.max(0, value) : 0;
}
