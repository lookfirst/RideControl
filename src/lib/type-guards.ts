type UnknownFunction = (...args: never[]) => unknown;

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function isFunction(value: unknown): value is UnknownFunction {
	return typeof value === 'function';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
	return typeof value === 'string';
}
