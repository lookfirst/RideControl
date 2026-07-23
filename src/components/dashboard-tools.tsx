import { DevicePairingButton } from './device-pairing';

export function DashboardTools({
	connectedDeviceCount,
	devicesConnecting,
	onOpenDevices,
	onOpenHistory,
	onOpenShortcuts,
	pairedDeviceCount,
}: {
	connectedDeviceCount: number;
	devicesConnecting: boolean;
	onOpenDevices: () => void;
	onOpenHistory: () => void;
	onOpenShortcuts: () => void;
	pairedDeviceCount: number;
}) {
	return (
		<div className="flex items-center gap-3">
			<button
				className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
				onClick={onOpenHistory}
				type="button"
			>
				Sessions
			</button>
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
