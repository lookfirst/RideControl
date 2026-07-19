import { MAX_RESISTANCE, MIN_RESISTANCE } from '../lib/resistance';
import type { ResistanceAdjustmentDirection, ResistanceRamp } from '../types';
import { ResistanceControl } from './resistance-control';
import { TrainingControlPanel } from './training-control-panel';

export function ResistanceTrainingControl({
	connected,
	keyboardFlash,
	onChange,
	ramp,
	resistance,
}: {
	connected: boolean;
	keyboardFlash?: ResistanceAdjustmentDirection;
	onChange: (resistance: number) => void;
	ramp: ResistanceRamp;
	resistance: number;
}) {
	return (
		<TrainingControlPanel title="Resistance control" unit="%" value={resistance}>
			<ResistanceControl
				disabled={!connected}
				keyboardFlash={keyboardFlash}
				max={MAX_RESISTANCE}
				min={MIN_RESISTANCE}
				onChange={onChange}
				ramp={ramp}
				step={1}
				value={resistance}
			/>
		</TrainingControlPanel>
	);
}
