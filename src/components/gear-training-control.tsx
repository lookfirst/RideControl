import { MAX_GEAR } from '../lib/gears';
import type { ResistanceAdjustmentDirection } from '../types';
import { GearControl } from './gear-control';
import { TrainingControlPanel } from './training-control-panel';

export function GearTrainingControl({
	connected,
	gear,
	onShift,
	shiftFlash,
}: {
	connected: boolean;
	gear: number;
	onShift: (change: number) => void;
	shiftFlash?: ResistanceAdjustmentDirection;
}) {
	return (
		<TrainingControlPanel title="Virtual shifting" unit={`of ${MAX_GEAR}`} value={gear}>
			<GearControl
				disabled={!connected}
				gear={gear}
				onChange={onShift}
				shiftFlash={shiftFlash}
			/>
		</TrainingControlPanel>
	);
}
