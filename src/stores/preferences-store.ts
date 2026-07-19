import { createStore } from '@tanstack/react-store';
import { CHART_MODE_STORAGE_KEY, storedChartMode } from '../lib/chart';
import { SPEED_UNIT_STORAGE_KEY, storedSpeedUnit } from '../lib/units';
import type { ChartMode, SpeedUnit } from '../types';

interface PreferencesStorage extends Pick<Storage, 'getItem' | 'setItem'> {}

const unavailableStorage: PreferencesStorage = {
	getItem: () => null,
	setItem: () => undefined,
};

const defaultPreferencesStorage = globalThis.localStorage ?? unavailableStorage;

export interface PreferencesStoreState {
	chartMode: ChartMode;
	speedUnit: SpeedUnit;
}

export function createPreferencesStore(storage: PreferencesStorage = defaultPreferencesStorage) {
	return createStore(
		{
			chartMode: storedChartMode(storage),
			speedUnit: storedSpeedUnit(storage),
		},
		({ setState }) => ({
			selectChartMode: (chartMode: ChartMode) => {
				storage.setItem(CHART_MODE_STORAGE_KEY, chartMode);
				setState((current) => ({ ...current, chartMode }));
			},
			selectSpeedUnit: (speedUnit: SpeedUnit) => {
				storage.setItem(SPEED_UNIT_STORAGE_KEY, speedUnit);
				setState((current) => ({ ...current, speedUnit }));
			},
		})
	);
}

export const preferencesStore = createPreferencesStore();
