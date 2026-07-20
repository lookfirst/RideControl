import { useEffect, useState } from 'react';
import { CHROME_BLUETOOTH_FLAGS_URL } from '../constants';
import { automaticBluetoothReconnectConfigured, bluetoothBrowserNotice } from '../lib/browser';
import type { DeviceConnectionView } from '../lib/device-connection';
import { MAX_CLICK_CONTROLLERS } from '../lib/zwift-click';
import { Icon } from './icon';
import { SideTray } from './side-tray';

interface DeviceSlot extends DeviceConnectionView {
	battery?: number;
	name?: string;
	onDisconnect: () => void;
	onForget: () => void | Promise<void>;
	onPair: () => void | Promise<void>;
	onReconnect: () => void | Promise<void>;
}

interface ClickController extends DeviceConnectionView {
	active: boolean;
	id: string;
	label: string;
}

interface ClickSlot extends DeviceSlot {
	connectedCount: number;
	controllers: ClickController[];
	onForgetController: (deviceId: string) => void | Promise<void>;
	pairedCount: number;
	pairing: boolean;
	reconnecting: boolean;
}

const SLOW_RECONNECT_NOTICE_DELAY_MS = 10_000;

function ConnectingLabel() {
	return (
		<span className="whitespace-nowrap">
			<span className="sr-only">Connecting...</span>
			<span aria-hidden="true">
				Connecting
				<span className="connecting-dot">.</span>
				<span className="connecting-dot">.</span>
				<span className="connecting-dot">.</span>
			</span>
		</span>
	);
}

function SlowReconnectNotice() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const timeout = window.setTimeout(() => setVisible(true), SLOW_RECONNECT_NOTICE_DELAY_MS);
		return () => window.clearTimeout(timeout);
	}, []);

	if (!visible) {
		return null;
	}

	return (
		<div
			className="mt-4 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2.5 text-sky-100 text-xs leading-relaxed"
			role="status"
		>
			Connecting can take up to 60 seconds. Please be patient. If a device seems stuck, reload
			the page or re-pair it.
		</div>
	);
}

function DeviceConnectionAction({
	busy,
	disconnecting,
}: {
	busy: boolean;
	disconnecting: boolean;
}) {
	if (busy) {
		return <ConnectingLabel />;
	}
	return disconnecting ? 'Disconnect' : 'Reconnect';
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

function StatusDot({
	bluePulse = false,
	busy,
	connected,
}: {
	bluePulse?: boolean;
	busy: boolean;
	connected: boolean;
}) {
	let statusClass = 'bg-slate-600';
	if (busy) {
		statusClass = bluePulse
			? 'connection-status-pulse bg-sky-300 ring-2 ring-sky-400/35 shadow-[0_0_16px_rgba(56,189,248,.95)]'
			: 'connection-status-pulse bg-yellow-300 ring-2 ring-yellow-300/25 shadow-[0_0_14px_rgba(253,224,71,.75)]';
	} else if (connected) {
		statusClass = 'bg-mint shadow-[0_0_10px_rgba(173,245,189,.55)]';
	}
	return (
		<span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusClass}`} />
	);
}

function DeviceActions({ slot }: { slot: DeviceSlot }) {
	const actionBusy = slot.busy;
	if (!slot.paired) {
		return (
			<button
				className="h-9 rounded-lg bg-lime px-3 font-bold text-ink text-xs transition hover:bg-[#e4ff9c] disabled:opacity-50"
				disabled={actionBusy}
				onClick={slot.onPair}
				type="button"
			>
				{actionBusy ? 'Pairing…' : 'Pair'}
			</button>
		);
	}
	const disconnecting = slot.connected && !actionBusy;
	return (
		<div className="flex flex-wrap justify-end gap-2">
			<button
				className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs transition hover:border-slate-500 hover:text-white disabled:opacity-50"
				disabled={actionBusy}
				onClick={disconnecting ? slot.onDisconnect : slot.onReconnect}
				type="button"
			>
				<DeviceConnectionAction busy={actionBusy} disconnecting={disconnecting} />
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

function AutomaticReconnectStatus({
	configured,
	copied,
	copyLabel,
	onCopy,
}: {
	configured: boolean;
	copied: boolean;
	copyLabel: string;
	onCopy: () => void | Promise<void>;
}) {
	if (configured) {
		return (
			<aside className="rounded-xl border border-mint/20 bg-mint/5 p-3 text-[11px] text-slate-400 leading-relaxed">
				<p className="flex items-center gap-2 font-semibold text-mint text-xs">
					<span
						aria-hidden="true"
						className="h-2 w-2 shrink-0 rounded-full bg-mint shadow-[0_0_8px_rgba(173,245,189,.45)]"
					/>
					Automatic reconnect is configured correctly
				</p>
			</aside>
		);
	}

	return (
		<aside className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3 text-[11px] text-slate-400 leading-relaxed">
			<h3 className="font-semibold text-slate-200 text-xs">Automatic reconnect in Chrome</h3>
			<p className="mt-1">
				Chrome needs persistent Bluetooth permissions to reconnect devices after a refresh.
			</p>
			<ol className="mt-2 list-decimal space-y-1 pl-4">
				<li>
					{copied ? null : 'Open '}
					<button
						aria-label="Copy Chrome Bluetooth settings address"
						className="wrap-break-word max-w-full text-left align-top font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
						onClick={onCopy}
						type="button"
					>
						{copyLabel}
					</button>
				</li>
				<li>
					Enable <strong>Use the new permissions backend for Web Bluetooth</strong>.
				</li>
				<li>Relaunch Chrome, then pair each device once more.</li>
			</ol>
		</aside>
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
						{slot.busy && slot.paired ? (
							<ConnectingLabel />
						) : (
							<>
								{slot.status}
								{slot.battery === undefined ? '' : ` · ${slot.battery}% battery`}
							</>
						)}
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
	if (pairedCount) {
		buttonClass = 'border-line bg-[#12171d] text-slate-200 hover:border-slate-500';
	} else if (connecting) {
		buttonClass =
			'border-sky-400/70 bg-sky-400/10 text-sky-100 shadow-[0_0_16px_rgba(56,189,248,.12)] hover:border-sky-300';
	}
	let statusClass = 'bg-slate-600';
	if (connecting) {
		statusClass =
			'connection-status-pulse bg-sky-300 ring-2 ring-sky-400/35 shadow-[0_0_16px_rgba(56,189,248,.95)]';
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
					<span className={`h-2.5 w-2.5 rounded-full ${statusClass}`} />
					{connectedCount}/{pairedCount}
				</span>
			) : null}
		</button>
	);
}

export function DevicePairingPanel({
	automaticReconnectConfigured = automaticBluetoothReconnectConfigured(),
	browserNotice = bluetoothBrowserNotice(),
	click,
	heartRate,
	onClose,
	open,
	trainer,
}: {
	automaticReconnectConfigured?: boolean;
	browserNotice?: string;
	click: ClickSlot;
	heartRate: DeviceSlot;
	onClose: () => void;
	open: boolean;
	trainer: DeviceSlot;
}) {
	const [flagsUrlCopied, setFlagsUrlCopied] = useState(false);
	const copyChromeFlagsUrl = async () => {
		await navigator.clipboard.writeText(CHROME_BLUETOOTH_FLAGS_URL);
		setFlagsUrlCopied(true);
	};

	const clickSlot: DeviceSlot = click;
	const waitingForControllers = click.reconnecting || click.phase === 'connecting';
	const reconnecting = trainer.reconnecting || heartRate.reconnecting || click.reconnecting;
	const allPairedDevicesConnected =
		[trainer, heartRate].every((slot) => !slot.paired || slot.connected) &&
		click.connectedCount === click.pairedCount;
	const orderedClickControllers = [...click.controllers].sort(
		(left, right) => clickControllerOrder(left) - clickControllerOrder(right)
	);
	let pairControllerLabel = 'Pair controller';
	if (click.pairing) {
		pairControllerLabel = 'Selecting…';
	} else if (click.pairedCount) {
		pairControllerLabel = 'Pair other controller';
	}
	const chromeFlagsCopyLabel = flagsUrlCopied
		? 'copied, now paste it into a new tab.'
		: CHROME_BLUETOOTH_FLAGS_URL;

	return (
		<SideTray
			closeLabel="Close paired devices"
			labelledBy="paired-devices-title"
			onClose={onClose}
			open={open}
			panelClassName="max-w-md overflow-y-auto overflow-x-hidden p-5 sm:p-6"
		>
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="font-bold text-2xl" id="paired-devices-title">
						Paired devices
					</h2>
					<p className="mt-1 max-w-sm text-slate-400 text-sm">
						Pair each sensor once. Ride Control reconnects remembered devices when they
						wake up.
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
			{open &&
			!browserNotice &&
			automaticReconnectConfigured &&
			reconnecting &&
			!allPairedDevicesConnected ? (
				<SlowReconnectNotice />
			) : null}

			{browserNotice ? (
				<div
					className="mt-5 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-sky-100 text-sm"
					role="note"
				>
					<p>{browserNotice}</p>
				</div>
			) : null}

			{browserNotice ? null : (
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
										busy={waitingForControllers}
										connected={click.connectedCount > 0}
									/>
									<h3 className="font-bold text-sm text-white">Zwift Click V2</h3>
								</div>
								<p className="mt-1 text-slate-300 text-xs">
									{click.pairedCount
										? `${click.connectedCount} of ${click.pairedCount} controllers connected`
										: 'Pair each controller separately'}
								</p>
								<p className="mt-1 text-[11px] text-slate-500">
									{waitingForControllers ? <ConnectingLabel /> : click.status}
								</p>
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
											bluePulse
											busy={controller.busy}
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
							{click.pairedCount < MAX_CLICK_CONTROLLERS ? (
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
					<AutomaticReconnectStatus
						configured={automaticReconnectConfigured}
						copied={flagsUrlCopied}
						copyLabel={chromeFlagsCopyLabel}
						onCopy={copyChromeFlagsUrl}
					/>
				</div>
			)}
		</SideTray>
	);
}
