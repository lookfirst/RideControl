import { useEffect, useState } from 'react';
import {
	loadRememberedBluetoothDevices,
	type RememberedBluetoothDeviceCatalog,
	supportsRememberedBluetoothDevices,
} from '../lib/remembered-bluetooth-devices';

export function useRememberedBluetoothDevices(): RememberedBluetoothDeviceCatalog {
	const { bluetooth } = navigator;
	const [catalog, setCatalog] = useState<RememberedBluetoothDeviceCatalog>(() => ({
		supported: supportsRememberedBluetoothDevices(bluetooth),
	}));

	useEffect(() => {
		let cancelled = false;
		if (!supportsRememberedBluetoothDevices(bluetooth)) {
			return;
		}
		loadRememberedBluetoothDevices(bluetooth).then(
			(devices) => {
				if (!cancelled) {
					setCatalog({ devices, supported: true });
				}
			},
			(error: unknown) => {
				if (!cancelled) {
					setCatalog({ error, supported: true });
				}
			}
		);
		return () => {
			cancelled = true;
		};
	}, []);

	return catalog;
}
