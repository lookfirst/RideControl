import { Icon } from './icon';

export function SessionControls({
	ended,
	isRiding,
	manuallyPaused,
	onEnd,
	onRequestNew,
	onSave,
	onTogglePause,
	saveResolved,
}: {
	ended: boolean;
	isRiding: boolean;
	manuallyPaused: boolean;
	onEnd: () => void;
	onRequestNew: () => void;
	onSave: () => void;
	onTogglePause: () => void;
	saveResolved: boolean;
}) {
	if (ended) {
		return (
			<div className="flex flex-wrap items-center gap-2">
				{saveResolved ? null : (
					<button
						className="h-10 rounded-lg border border-mint/40 bg-mint/10 px-3 font-semibold text-mint text-xs hover:bg-mint/15"
						onClick={onSave}
						type="button"
					>
						Save session
					</button>
				)}
				<button
					className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
					onClick={onRequestNew}
					type="button"
				>
					Start new session
				</button>
			</div>
		);
	}

	let controlLabel = 'Auto paused';
	let controlIcon = 'stop';
	if (isRiding) {
		controlLabel = 'Pause';
		controlIcon = 'pause';
	}
	if (manuallyPaused) {
		controlLabel = 'Resume';
		controlIcon = 'play';
	}
	return (
		<div className="flex flex-wrap items-center gap-2">
			<button
				className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 font-semibold text-xs transition ${isRiding ? 'border-mint/40 bg-mint/10 text-mint' : 'border-line bg-[#12171d] text-slate-400'}`}
				onClick={onTogglePause}
				type="button"
			>
				<Icon className="h-4 w-4" name={controlIcon} />
				{controlLabel}
			</button>
			<button
				className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-400 text-xs hover:border-rose-400/50 hover:text-rose-300"
				onClick={onEnd}
				type="button"
			>
				End session
			</button>
		</div>
	);
}
