import { useEffect } from 'react';
import { Icon } from './icon';

interface DeviceSlot {
	allowRetryWhileBusy?: boolean;
	battery?: number;
	busy: boolean;
	connected: boolean;
	name?: string;
	onDisconnect: () => void;
	onForget: () => void | Promise<void>;
	onPair: () => void | Promise<void>;
	onReconnect: () => void | Promise<void>;
	paired: boolean;
	status: string;
}

interface ClickController {
	active: boolean;
	connected: boolean;
	connecting: boolean;
	id: string;
	label: string;
}

interface ClickSlot extends DeviceSlot {
	connectedCount: number;
	controllers: ClickController[];
	onForgetController: (deviceId: string) => void | Promise<void>;
	pairedCount: number;
	pairing: boolean;
}

function clickControllerOrder(controller: ClickController) {
	if (controller.label.startsWith('+')) {
		return 0;
	}
	if (controller.label.startsWith('−')) {
		return 1;
	}
	return 2;
}

function StatusDot({ connected, busy }: { connected: boolean; busy: boolean }) {
	let statusClass = 'bg-slate-600';
	if (busy) {
		statusClass = 'animate-pulse bg-yellow-300';
	} else if (connected) {
		statusClass = 'bg-mint shadow-[0_0_10px_rgba(173,245,189,.55)]';
	}
	return (
		<span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusClass}`} />
	);
}

function DeviceActions({ slot }: { slot: DeviceSlot }) {
	if (!slot.paired) {
		return (
			<button
				className="h-9 rounded-lg bg-lime px-3 font-bold text-ink text-xs transition hover:bg-[#e4ff9c] disabled:opacity-50"
				disabled={slot.busy}
				onClick={slot.onPair}
				type="button"
			>
				{slot.busy ? 'Pairing…' : 'Pair'}
			</button>
		);
	}
	let connectionAction = 'Reconnect';
	if (slot.busy) {
		connectionAction = slot.allowRetryWhileBusy ? 'Retry' : 'Connecting…';
	} else if (slot.connected) {
		connectionAction = 'Disconnect';
	}
	const disconnecting = slot.connected && !slot.busy;
	return (
		<div className="flex flex-wrap justify-end gap-2">
			<button
				className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs transition hover:border-slate-500 hover:text-white disabled:opacity-50"
				disabled={slot.busy && !slot.allowRetryWhileBusy}
				onClick={disconnecting ? slot.onDisconnect : slot.onReconnect}
				type="button"
			>
				{connectionAction}
			</button>
			<button
				className="h-9 rounded-lg border border-rose-400/25 px-3 font-semibold text-rose-300 text-xs transition hover:border-rose-400/60 hover:bg-rose-400/5"
				onClick={slot.onForget}
				type="button"
			>
				Forget
			</button>
		</div>
	);
}

function DeviceCard({
	description,
	icon,
	title,
	slot,
}: {
	description: string;
	icon: string;
	title: string;
	slot: DeviceSlot;
}) {
	return (
		<article className="rounded-2xl border border-line bg-[#12171d] p-4">
			<div className="flex items-start gap-3">
				<div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300">
					<Icon className="h-5 w-5" name={icon} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<StatusDot busy={slot.busy} connected={slot.connected} />
						<h3 className="font-bold text-sm text-white">{title}</h3>
					</div>
					<p className="mt-1 truncate font-medium text-slate-300 text-xs">
						{slot.name ?? description}
					</p>
					<p className="mt-1 text-[11px] text-slate-500">
						{slot.status}
						{slot.battery === undefined ? '' : ` · ${slot.battery}% battery`}
					</p>
				</div>
			</div>
			<div className="mt-4 flex justify-end">
				<DeviceActions slot={slot} />
			</div>
		</article>
	);
}

export function DevicePairingButton({
	connectedCount,
	connecting = false,
	onClick,
	pairedCount,
}: {
	connectedCount: number;
	connecting?: boolean;
	onClick: () => void;
	pairedCount: number;
}) {
	const allConnected = pairedCount > 0 && connectedCount === pairedCount;
	let buttonClass = 'border-lime bg-lime text-ink hover:bg-[#e4ff9c]';
	if (connecting) {
		buttonClass =
			'border-sky-400/70 bg-sky-400/10 text-sky-100 shadow-[0_0_16px_rgba(56,189,248,.12)] hover:border-sky-300';
	} else if (pairedCount) {
		buttonClass = 'border-line bg-[#12171d] text-slate-200 hover:border-slate-500';
	}
	let statusClass = 'bg-slate-600';
	if (connecting) {
		statusClass = 'animate-pulse bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,.7)]';
	} else if (allConnected) {
		statusClass = 'bg-mint shadow-[0_0_8px_rgba(173,245,189,.45)]';
	}
	return (
		<button
			aria-busy={connecting}
			className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 font-semibold text-sm transition ${buttonClass}`}
			onClick={onClick}
			type="button"
		>
			<Icon className="h-4 w-4" name="bluetooth" />
			<span>{pairedCount ? 'Devices' : 'Pair devices'}</span>
			{pairedCount ? (
				<span className="inline-flex items-center gap-1.5 border-line border-l pl-2 text-xs">
					<span className={`h-2 w-2 rounded-full ${statusClass}`} />
					{connectedCount}/{pairedCount}
				</span>
			) : null}
		</button>
	);
}

export function DevicePairingPanel({
	click,
	heartRate,
	onClose,
	open,
	trainer,
}: {
	click: ClickSlot;
	heartRate: DeviceSlot;
	onClose: () => void;
	open: boolean;
	trainer: DeviceSlot;
}) {
	useEffect(() => {
		if (!open) {
			return;
		}
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
			}
		};
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', closeOnEscape);
		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener('keydown', closeOnEscape);
		};
	}, [onClose, open]);

	if (!open) {
		return null;
	}

	const clickSlot: DeviceSlot = {
		...click,
		allowRetryWhileBusy: true,
		connected: click.pairedCount > 0 && click.connectedCount === click.pairedCount,
		paired: click.pairedCount > 0,
	};
	const orderedClickControllers = [...click.controllers].sort(
		(left, right) => clickControllerOrder(left) - clickControllerOrder(right)
	);
	let pairControllerLabel = 'Pair controller';
	if (click.pairing) {
		pairControllerLabel = 'Selecting…';
	} else if (click.pairedCount) {
		pairControllerLabel = 'Pair other controller';
	}

	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm">
			<button
				aria-label="Close paired devices"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onClose}
				type="button"
			/>
			<section
				aria-labelledby="paired-devices-title"
				aria-modal="true"
				className="relative h-full w-full max-w-md overflow-y-auto overflow-x-hidden border-line border-l bg-panel p-5 shadow-2xl shadow-black/60 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="font-bold text-2xl" id="paired-devices-title">
							Paired devices
						</h2>
						<p className="mt-1 max-w-sm text-slate-400 text-sm">
							Pair each sensor once. Ride Control reconnects remembered devices when
							they wake up.
						</p>
					</div>
					<button
						aria-label="Close paired devices"
						autoFocus
						className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</div>

				<div className="mt-6 space-y-3">
					<DeviceCard
						description="Power, cadence and resistance control"
						icon="bike"
						slot={trainer}
						title="Smart trainer"
					/>
					<DeviceCard
						description="Standard Bluetooth heart rate monitor"
						icon="heart"
						slot={heartRate}
						title="Heart rate"
					/>

					<article className="rounded-2xl border border-line bg-[#12171d] p-4">
						<div className="flex items-start gap-3">
							<div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300">
								<Icon className="h-5 w-5" name="controls" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<StatusDot
										busy={click.busy}
										connected={click.connectedCount > 0}
									/>
									<h3 className="font-bold text-sm text-white">Zwift Click V2</h3>
								</div>
								<p className="mt-1 text-slate-300 text-xs">
									{click.pairedCount
										? `${click.connectedCount} of ${click.pairedCount} controllers connected`
										: 'Pair each controller separately'}
								</p>
								<p className="mt-1 text-[11px] text-slate-500">{click.status}</p>
							</div>
						</div>

						{orderedClickControllers.length ? (
							<div className="mt-4 overflow-hidden rounded-xl border border-line">
								{orderedClickControllers.map((controller) => (
									<div
										className={`flex items-center gap-3 border-line border-b px-3 py-2.5 transition duration-150 last:border-b-0 ${controller.active ? 'bg-mint/10' : ''}`}
										key={controller.id}
									>
										<StatusDot
											busy={controller.connecting}
											connected={controller.connected}
										/>
										<div className="min-w-0 flex-1">
											<p
												className={`font-semibold text-xs transition ${controller.active ? 'text-mint' : 'text-slate-200'}`}
											>
												{controller.label}
											</p>
										</div>
										<button
											className="font-semibold text-[11px] text-rose-300 hover:text-rose-200"
											onClick={() => click.onForgetController(controller.id)}
											type="button"
										>
											Forget
										</button>
									</div>
								))}
							</div>
						) : null}

						<div className="mt-4 flex flex-wrap justify-end gap-2">
							{click.pairedCount > 0 ? <DeviceActions slot={clickSlot} /> : null}
							{click.pairedCount < 2 ? (
								<button
									className="h-9 rounded-lg bg-lime px-3 font-bold text-ink text-xs transition hover:bg-[#e4ff9c] disabled:opacity-50"
									disabled={click.pairing}
									onClick={click.onPair}
									type="button"
								>
									{pairControllerLabel}
								</button>
							) : null}
						</div>
						<p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
							Wake each controller before pairing. The + and − sides are identified
							automatically and reconnect in the background.
						</p>
					</article>
				</div>
			</section>
		</div>
	);
}
