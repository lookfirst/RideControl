import { useEffect, useState } from 'react';
import { CHROME_BLUETOOTH_FLAGS_URL } from '../constants';
import { useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { automaticBluetoothReconnectConfigured, bluetoothBrowserNotice } from '../lib/browser';
import type { DeviceConnectionView } from '../lib/device-connection';
import {
	CLICK_LATEST_FIRMWARE_VERSION,
	CLICK_SHIFT,
	type ClickShift,
	clickFirmwareNeedsUpdate,
} from '../lib/zwift-click';
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
	activeShift?: ClickShift;
	battery?: number;
	firmwareVersion?: string;
	id?: string;
	label: string;
	role: ClickShift;
}

interface ClickSlot extends Omit<DeviceSlot, 'onPair'> {
	connectedCount: number;
	connectionActive: boolean;
	controllers: ClickController[];
	onForgetController: (role: ClickShift) => void | Promise<void>;
	onPairController: (role: ClickShift) => void | Promise<void>;
	pairedCount: number;
	pairingRole?: ClickShift;
	reconnecting: boolean;
}

const SLOW_RECONNECT_NOTICE_DELAY_MS = 10_000;
const ZWIFT_CLICK_FIRMWARE_HELP_URL =
	'https://support.zwift.com/updating-your-zwift-click-firmware-B1IdjkGW6';

function clickControllerDetailText(controller: ClickController): string | undefined {
	const details: string[] = [];
	if (controller.firmwareVersion) {
		details.push(
			clickFirmwareNeedsUpdate(controller.firmwareVersion)
				? `Firmware ${controller.firmwareVersion} · update to ${CLICK_LATEST_FIRMWARE_VERSION}`
				: `Firmware ${controller.firmwareVersion}`
		);
	}
	if (controller.battery !== undefined) {
		details.push(`${controller.battery}% battery`);
	}
	return details.length ? details.join(' · ') : undefined;
}

function ClickControllerRow({
	controller,
	onForget,
	onPair,
	pairingRole,
}: {
	controller: ClickController;
	onForget: (role: ClickShift) => void | Promise<void>;
	onPair: (role: ClickShift) => void | Promise<void>;
	pairingRole?: ClickShift;
}) {
	const detailText = clickControllerDetailText(controller);
	const activeShiftSymbol = controller.activeShift === CLICK_SHIFT.UP ? '+' : '−';
	return (
		<div
			className={`flex items-center gap-3 border-line border-b px-3 py-2.5 transition duration-150 last:border-b-0 ${controller.active ? 'bg-mint/10' : ''}`}
		>
			<StatusDot bluePulse busy={controller.busy} connected={controller.connected} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p
						className={`font-semibold text-xs transition ${controller.active ? 'text-mint' : 'text-slate-200'}`}
					>
						{controller.label}
					</p>
					<output
						aria-hidden={controller.activeShift ? undefined : true}
						aria-label={
							controller.activeShift
								? `${activeShiftSymbol} shift pressed`
								: undefined
						}
						className={`grid h-5 w-5 shrink-0 place-items-center rounded-md bg-mint font-bold text-[11px] text-ink ${controller.activeShift ? '' : 'invisible'}`}
					>
						{controller.activeShift ? activeShiftSymbol : null}
					</output>
				</div>
				{detailText ? (
					<p
						className={`mt-0.5 text-[10px] ${clickFirmwareNeedsUpdate(controller.firmwareVersion) ? 'text-amber-300' : 'text-slate-500'}`}
					>
						{detailText}
					</p>
				) : null}
			</div>
			{controller.paired ? (
				<button
					className="font-semibold text-[11px] text-rose-300 hover:text-rose-200"
					onClick={() => onForget(controller.role)}
					type="button"
				>
					Forget
				</button>
			) : (
				<button
					className="h-8 rounded-lg bg-lime px-3 font-bold text-[11px] text-ink transition hover:bg-[#e4ff9c] disabled:opacity-50"
					disabled={pairingRole !== undefined}
					onClick={() => onPair(controller.role)}
					type="button"
				>
					{pairingRole === controller.role ? 'Selecting…' : 'Pair'}
				</button>
			)}
		</div>
	);
}

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

function ClickConnectionStatus({ click, waiting }: { click: ClickSlot; waiting: boolean }) {
	if (!click.connectionActive && click.pairedCount) {
		return <>Reconnects when the session resumes</>;
	}
	if (waiting) {
		return <ConnectingLabel />;
	}
	return <>{click.status}</>;
}

function clickControllerSummary(click: ClickSlot): string {
	if (click.connectedCount) {
		return 'Controller connected';
	}
	return click.pairedCount ? 'Controller paired' : 'Pair the + controller';
}

function chromeFlagsLabel(copied: boolean) {
	return copied ? 'copied, now paste it into a new tab.' : CHROME_BLUETOOTH_FLAGS_URL;
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
	return <ConnectedDeviceActions slot={slot} />;
}

function ConnectedDeviceActions({ slot }: { slot: Omit<DeviceSlot, 'onPair'> }) {
	const disconnecting = slot.connected && !slot.busy;
	return (
		<div className="flex flex-wrap justify-end gap-2">
			<button
				className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs transition hover:border-slate-500 hover:text-white disabled:opacity-50"
				disabled={slot.busy}
				onClick={disconnecting ? slot.onDisconnect : slot.onReconnect}
				type="button"
			>
				<DeviceConnectionAction busy={slot.busy} disconnecting={disconnecting} />
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
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	const [flagsUrlCopied, setFlagsUrlCopied] = useState(false);
	const copyChromeFlagsUrl = async () => {
		await navigator.clipboard.writeText(CHROME_BLUETOOTH_FLAGS_URL);
		setFlagsUrlCopied(true);
	};

	const waitingForControllers = click.reconnecting || click.phase === 'connecting';
	const clickFirmwareUpdateNeeded = click.controllers.some((controller) =>
		clickFirmwareNeedsUpdate(controller.firmwareVersion)
	);
	const reconnecting = trainer.reconnecting || heartRate.reconnecting || click.reconnecting;
	const allPairedDevicesConnected =
		[trainer, heartRate].every((slot) => !slot.paired || slot.connected) &&
		click.connectedCount === click.pairedCount;
	const chromeFlagsCopyLabel = chromeFlagsLabel(flagsUrlCopied);

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
						Pair each physical device once. Ride Control keeps the trainer, heart-rate
						monitor, and Click controller separate, then reconnects them automatically.
					</p>
				</div>
				<button
					aria-label="Close paired devices"
					className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
					onClick={onClose}
					ref={closeButtonRef}
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
									{clickControllerSummary(click)}
								</p>
								<p className="mt-1 text-[11px] text-slate-500">
									<ClickConnectionStatus
										click={click}
										waiting={waitingForControllers}
									/>
								</p>
							</div>
						</div>

						<div className="mt-4 overflow-hidden rounded-xl border border-line">
							{click.controllers.map((controller) => (
								<ClickControllerRow
									controller={controller}
									key={controller.role}
									onForget={click.onForgetController}
									onPair={click.onPairController}
									pairingRole={click.pairingRole}
								/>
							))}
						</div>

						<div className="mt-4 flex flex-wrap justify-end gap-2">
							{click.pairedCount > 0 && click.connectionActive ? (
								<ConnectedDeviceActions slot={click} />
							) : null}
						</div>
						<p className="mt-3 text-slate-500 text-xs leading-relaxed">
							Wake the physical + controller, then choose Pair. Its + button shifts
							up, and its blue Y button shifts down. It reconnects during open
							sessions, including auto-pause, and may disconnect during a manual pause
							or after the session ends.
						</p>
						{clickFirmwareUpdateNeeded ? (
							<p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
								Use firmware {CLICK_LATEST_FIRMWARE_VERSION}. Update it in the Zwift
								Companion app under Equipment → Zwift Click →{' '}
								<a
									className="font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
									href={ZWIFT_CLICK_FIRMWARE_HELP_URL}
									rel="noreferrer"
									target="_blank"
								>
									Update Firmware
								</a>
								.
							</p>
						) : null}
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
