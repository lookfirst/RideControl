import { CONTROL_MODE } from '../lib/control-mode';
import { unreachable } from '../lib/errors';
import type { ResistanceAdjustmentDirection, ResistanceRamp } from '../types';
import { GearTrainingControl } from './gear-training-control';
import { ResistanceTrainingControl } from './resistance-training-control';

type TrainingControlModel =
	| {
			gear: number;
			maximumGear: number;
			mode: typeof CONTROL_MODE.GEAR;
			onShift: (change: number) => void;
			shiftFlash?: ResistanceAdjustmentDirection;
	  }
	| {
			keyboardFlash?: ResistanceAdjustmentDirection;
			mode: typeof CONTROL_MODE.RESISTANCE;
			onChange: (resistance: number) => void;
			ramp: ResistanceRamp;
			resistance: number;
	  };

export function TrainingControl({
	connected,
	control,
}: {
	connected: boolean;
	control: TrainingControlModel;
}) {
	switch (control.mode) {
		case CONTROL_MODE.GEAR:
			return (
				<GearTrainingControl
					connected={connected}
					gear={control.gear}
					maximumGear={control.maximumGear}
					onShift={control.onShift}
					shiftFlash={control.shiftFlash}
				/>
			);
		case CONTROL_MODE.RESISTANCE:
			return (
				<ResistanceTrainingControl
					connected={connected}
					keyboardFlash={control.keyboardFlash}
					onChange={control.onChange}
					ramp={control.ramp}
					resistance={control.resistance}
				/>
			);
		default:
			return unreachable(control);
	}
}
