import type { ResistanceAdjustmentDirection } from '../types';
import { GearControl } from './gear-control';
import { TrainingControlPanel } from './training-control-panel';

export function GearTrainingControl({
	connected,
	gear,
	maximumGear,
	onShift,
	shiftFlash,
}: {
	connected: boolean;
	gear: number;
	maximumGear: number;
	onShift: (change: number) => void;
	shiftFlash?: ResistanceAdjustmentDirection;
}) {
	return (
		<TrainingControlPanel title="Virtual shifting" unit={`of ${maximumGear}`} value={gear}>
			<GearControl
				disabled={!connected}
				gear={gear}
				maximumGear={maximumGear}
				onChange={onShift}
				shiftFlash={shiftFlash}
			/>
		</TrainingControlPanel>
	);
}
