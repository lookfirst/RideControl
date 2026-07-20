export interface RememberedBluetoothDeviceCatalog {
	devices?: readonly BluetoothDevice[];
	error?: unknown;
	supported: boolean;
}

export function supportsRememberedBluetoothDevices(
	bluetooth: Bluetooth | undefined = navigator.bluetooth
): boolean {
	return Boolean(bluetooth?.getDevices);
}

export function loadRememberedBluetoothDevices(
	bluetooth: Bluetooth | undefined = navigator.bluetooth
): Promise<readonly BluetoothDevice[]> {
	if (!bluetooth?.getDevices) {
		return Promise.resolve([]);
	}
	return Promise.resolve().then(() => bluetooth.getDevices?.() ?? []);
}

export function rememberedBluetoothDevice(
	devices: readonly BluetoothDevice[],
	deviceId: string | null
): BluetoothDevice | undefined {
	return deviceId ? devices.find(({ id }) => id === deviceId) : undefined;
}

export function rememberedBluetoothDevices(
	devices: readonly BluetoothDevice[],
	deviceIds: readonly string[],
	limit = deviceIds.length
): BluetoothDevice[] {
	return deviceIds
		.map((deviceId) => rememberedBluetoothDevice(devices, deviceId))
		.filter((device): device is BluetoothDevice => Boolean(device))
		.slice(0, limit);
}
