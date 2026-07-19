import { describe, expect, test } from 'bun:test';
import { isFiniteNumber, isFunction, isRecord, isString } from '../src/lib/type-guards';

describe('runtime type guards', () => {
	test('accepts only finite numbers', () => {
		expect(isFiniteNumber(42)).toBeTrue();
		expect(isFiniteNumber(Number.NaN)).toBeFalse();
		expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBeFalse();
		expect(isFiniteNumber('42')).toBeFalse();
	});

	test('identifies functions, records, and strings at untyped boundaries', () => {
		expect(isFunction(() => undefined)).toBeTrue();
		expect(isFunction(undefined)).toBeFalse();
		expect(isRecord({ value: 1 })).toBeTrue();
		expect(isRecord([])).toBeFalse();
		expect(isRecord(null)).toBeFalse();
		expect(isString('value')).toBeTrue();
		expect(isString(1)).toBeFalse();
	});
});
