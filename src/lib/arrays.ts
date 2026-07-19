export function evenlySample<T>(values: T[], limit: number): T[] {
	if (values.length <= limit) {
		return values;
	}
	return Array.from({ length: limit }, (_, index) => {
		const sourceIndex = Math.round((index * (values.length - 1)) / (limit - 1));
		return values[sourceIndex] as T;
	});
}
