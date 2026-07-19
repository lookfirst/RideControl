export function parseHeartRateMeasurement(value: DataView): number | undefined {
	if (value.byteLength < 2) {
		return;
	}
	const usesUint16 = Boolean(value.getUint8(0) & 1);
	if (usesUint16) {
		return value.byteLength >= 3 ? value.getUint16(1, true) : undefined;
	}
	return value.getUint8(1);
}
