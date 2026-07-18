import { Icon } from './icon';

export function ConnectionControl({
	busy,
	connected,
	deviceName,
	onCancel,
	onConnect,
	onDisconnect,
	status,
}: {
	busy: boolean;
	connected: boolean;
	deviceName?: string;
	onCancel: () => void;
	onConnect: () => void;
	onDisconnect: () => void;
	status: string;
}) {
	if (busy && !connected) {
		return (
			<div className="flex items-center gap-2">
				<div
					aria-live="polite"
					className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-[#10151a] px-3.5 py-2 font-semibold text-slate-300 text-sm"
					role="status"
				>
					<span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-lime" />
					{status}
				</div>
				<button
					className="min-h-10 rounded-lg border border-line px-3 py-2 font-semibold text-slate-400 text-sm transition hover:border-slate-500 hover:text-slate-200"
					onClick={onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
		);
	}

	if (connected) {
		return (
			<button
				className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-mint/30 bg-mint/5 px-3.5 py-2 font-semibold text-slate-100 text-sm transition hover:border-rose-400/50 hover:bg-rose-400/5"
				onClick={onDisconnect}
				type="button"
			>
				<span className="h-2 w-2 shrink-0 rounded-full bg-mint shadow-[0_0_12px_#adf5bd]" />
				<span className="max-w-36 truncate">{deviceName ?? 'Trainer'}</span>
				<span className="border-line border-l pl-2 text-slate-400 text-xs">Disconnect</span>
			</button>
		);
	}

	return (
		<button
			className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-lime bg-lime px-3.5 py-2 font-semibold text-ink text-sm transition hover:bg-[#e4ff9c]"
			onClick={onConnect}
			type="button"
		>
			<span className="h-2 w-2 shrink-0 rounded-full bg-ink/50" />
			<Icon className="h-4 w-4" name="bluetooth" />
			Connect trainer
		</button>
	);
}
