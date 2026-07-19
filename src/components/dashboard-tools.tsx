import { SPEED_UNIT_OPTIONS } from '../lib/units';
import type { SpeedUnit } from '../types';
import { DevicePairingButton } from './device-pairing';

export function DashboardTools({
	connectedDeviceCount,
	devicesConnecting,
	onOpenDevices,
	onOpenHistory,
	onOpenShortcuts,
	onSelectSpeedUnit,
	pairedDeviceCount,
	speedUnit,
}: {
	connectedDeviceCount: number;
	devicesConnecting: boolean;
	onOpenDevices: () => void;
	onOpenHistory: () => void;
	onOpenShortcuts: () => void;
	onSelectSpeedUnit: (unit: SpeedUnit) => void;
	pairedDeviceCount: number;
	speedUnit: SpeedUnit;
}) {
	return (
		<div className="flex items-center gap-3">
			<button
				className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
				onClick={onOpenHistory}
				type="button"
			>
				History
			</button>
			<div className="flex h-10 rounded-lg border border-line bg-[#10151a] p-1">
				{SPEED_UNIT_OPTIONS.map((option) => (
					<button
						className={`rounded px-2.5 py-1 font-bold text-[11px] ${speedUnit === option.value ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
						key={option.value}
						onClick={() => onSelectSpeedUnit(option.value)}
						type="button"
					>
						{option.label}
					</button>
				))}
			</div>
			<button
				aria-label="Show keyboard controls"
				className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-[#12171d] font-bold text-slate-400 text-sm hover:border-slate-500 hover:text-white"
				onClick={onOpenShortcuts}
				type="button"
			>
				?
			</button>
			<DevicePairingButton
				connectedCount={connectedDeviceCount}
				connecting={devicesConnecting}
				onClick={onOpenDevices}
				pairedCount={pairedDeviceCount}
			/>
		</div>
	);
}
