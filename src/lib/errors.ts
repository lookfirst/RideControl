export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function unreachable(value: never): never {
	throw new Error(`Unexpected value: ${String(value)}`);
}
