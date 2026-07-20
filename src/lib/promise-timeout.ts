export async function withPromiseTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	timeoutError: () => Error
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(timeoutError()), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
}
