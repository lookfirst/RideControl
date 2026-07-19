import { createStore } from '@tanstack/react-store';
import { emptyMetrics } from '../constants';
import type { DeviceConnectionPhase } from '../lib/device-connection';
import { MAX_RESISTANCE, MIN_RESISTANCE } from '../lib/resistance';
import { storedResistance } from '../lib/session';
import type { Metrics, Range, ResistanceAdjustmentDirection, ResistanceRamp } from '../types';

export interface TrainerStoreState {
	connectionPhase: DeviceConnectionPhase;
	deviceName?: string;
	metrics: Metrics;
	notice: string;
	pairedDeviceName?: string;
	resistance: number;
	resistanceKeyFlash?: ResistanceAdjustmentDirection;
	resistanceRamp: ResistanceRamp;
	resistanceRange: Range;
}

export function createTrainerStore() {
	const resistance = storedResistance();
	return createStore(
		{
			connectionPhase: 'unpaired',
			metrics: emptyMetrics,
			notice: '',
			resistance,
			resistanceRamp: {
				current: resistance,
				from: resistance,
				phase: 'holding',
				progress: 0,
				to: resistance,
			},
			resistanceRange: { max: MAX_RESISTANCE, min: MIN_RESISTANCE },
		} as TrainerStoreState,
		({ setState }) => ({
			mergeMetrics: (metrics: Partial<Metrics>) => {
				setState((current) => ({
					...current,
					metrics: { ...current.metrics, ...metrics },
				}));
			},
			setConnectionPhase: (connectionPhase: DeviceConnectionPhase) => {
				setState((current) => ({ ...current, connectionPhase }));
			},
			setDeviceName: (deviceName?: string) => {
				setState((current) => ({ ...current, deviceName }));
			},
			setMetrics: (metrics: Metrics) => {
				setState((current) => ({ ...current, metrics }));
			},
			setNotice: (notice: string) => {
				setState((current) => ({ ...current, notice }));
			},
			setPairedDeviceName: (pairedDeviceName?: string) => {
				setState((current) => ({ ...current, pairedDeviceName }));
			},
			setResistance: (nextResistance: number) => {
				setState((current) => ({ ...current, resistance: nextResistance }));
			},
			setResistanceKeyFlash: (resistanceKeyFlash?: ResistanceAdjustmentDirection) => {
				setState((current) => ({ ...current, resistanceKeyFlash }));
			},
			setResistanceRamp: (resistanceRamp: ResistanceRamp) => {
				setState((current) => ({ ...current, resistanceRamp }));
			},
			setResistanceRange: (resistanceRange: Range) => {
				setState((current) => ({ ...current, resistanceRange }));
			},
		})
	);
}

export type TrainerStore = ReturnType<typeof createTrainerStore>;
