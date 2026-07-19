import { useCallback, useEffect, useRef, useState } from 'react';
import { DevicePairingButton, DevicePairingPanel } from './components/device-pairing';
import { GearControl } from './components/gear-control';
import { Icon } from './components/icon';
import { KeyboardShortcutsDialog } from './components/keyboard-shortcuts-dialog';
import { Metric, SmallMetric } from './components/metrics';
import { Notification } from './components/notification';
import { ResistanceControl } from './components/resistance-control';
import { SessionChart } from './components/session-chart';
import { SessionHistory } from './components/session-history';
import { SessionSaveDialog } from './components/session-save-dialog';
import { WelcomeDialog } from './components/welcome-dialog';
import { useGearControl } from './hooks/use-gear-control';
import { useHeartRateMonitor } from './hooks/use-heart-rate-monitor';
import { useSession } from './hooks/use-session';
import { useTrainer } from './hooks/use-trainer';
import { useZwiftClick } from './hooks/use-zwift-click';
import { formatAggregateAverage, formatDuration } from './lib/format';
import { type AppShortcut, appShortcutForKey, gearingKeyboardShortcuts } from './lib/keyboard';
import {
	createSavedSession,
	requestPersistentSessionStorage,
	saveSession,
} from './lib/saved-sessions';
import { requestUnloadConfirmation, sessionNeedsUnloadWarning } from './lib/session';
import { rememberWelcomeDismissal, shouldShowWelcome } from './lib/welcome';
import type {
	ControlMode,
	Metrics,
	RoutePoint,
	SavedSession,
	SessionMetadata,
	SpeedUnit,
} from './types';

const EMPTY_ROUTE: RoutePoint[] = [];

function shouldIgnoreShortcut(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null;
	return (
		event.defaultPrevented ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		target?.matches("button, a, input, textarea, select, [contenteditable='true']")
	);
}

function metricsWithHeartRate(metrics: Metrics, connected: boolean, heartRate: number): Metrics {
	if (!connected) {
		return metrics;
	}
	return { ...metrics, heartRate };
}

function shiftHandlerUnlessBlocked(handler: (change: number) => void, blocked: boolean) {
	return blocked ? () => undefined : handler;
}

function controlModeForClick(paired: boolean): ControlMode {
	return paired ? 'gear' : 'resistance';
}

export function App() {
	const trainer = useTrainer();
	const [devicesOpen, setDevicesOpen] = useState(false);
	const clickShiftRef = useRef<(change: number) => void>(() => undefined);
	const handleClickShift = useCallback((change: number) => clickShiftRef.current(change), []);
	const click = useZwiftClick(handleClickShift, trainer.setNotice, devicesOpen);
	const heartRate = useHeartRateMonitor(trainer.setNotice);
	const liveMetrics = metricsWithHeartRate(
		trainer.metrics,
		heartRate.connected,
		heartRate.heartRate
	);
	const { connected } = trainer;
	const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(() =>
		localStorage.getItem('speed-unit') === 'kmh' ? 'kmh' : 'mph'
	);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [welcomeOpen, setWelcomeOpen] = useState(shouldShowWelcome);
	const dashboardKeyboardEnabled = !(devicesOpen || historyOpen || shortcutsOpen || welcomeOpen);
	const gearControl = useGearControl({
		active: click.paired,
		connected: trainer.connected,
		keyboardEnabled: dashboardKeyboardEnabled,
		onResistanceChange: trainer.shiftResistanceBy,
		resistance: trainer.resistance,
		setNotice: trainer.setNotice,
	});
	clickShiftRef.current = shiftHandlerUnlessBlocked(gearControl.shiftGear, devicesOpen);
	const session = useSession(
		liveMetrics,
		{
			gear: gearControl.gear,
			mode: controlModeForClick(click.paired),
			resistance: trainer.resistance,
		},
		trainer.lastPedalingAt,
		trainer.trainerReportsDistance
	);
	const { isRiding, manuallyPaused } = session;
	const sessionIsSaved = Boolean(session.savedSessionId);
	const [saveDialogOpen, setSaveDialogOpen] = useState(() => session.ended && !sessionIsSaved);
	const [saving, setSaving] = useState(false);
	const [startAfterSave, setStartAfterSave] = useState(false);
	const [continuationAfterSave, setContinuationAfterSave] = useState<SavedSession>();
	const endSession = useCallback(() => {
		session.endSession();
		setStartAfterSave(false);
		setContinuationAfterSave(undefined);
		setSaveDialogOpen(true);
	}, [session.endSession]);
	const startNewSession = useCallback(() => {
		session.startNew();
		setSaveDialogOpen(false);
		setStartAfterSave(false);
		setContinuationAfterSave(undefined);
		trainer.setNotice('New session ready.');
	}, [session.startNew, trainer.setNotice]);
	const continueSession = useCallback(
		(savedSession: SavedSession) => {
			session.continueFrom(savedSession);
			setHistoryOpen(false);
			setSaveDialogOpen(false);
			setStartAfterSave(false);
			setContinuationAfterSave(undefined);
			trainer.setNotice('Session continued.');
		},
		[session.continueFrom, trainer.setNotice]
	);
	const requestNewSession = useCallback(() => {
		if (session.ended) {
			if (sessionIsSaved) {
				startNewSession();
			} else {
				setStartAfterSave(true);
				setContinuationAfterSave(undefined);
				setSaveDialogOpen(true);
			}
			return;
		}
		if (session.elapsedSeconds > 0) {
			session.endSession();
			setStartAfterSave(true);
			setContinuationAfterSave(undefined);
			setSaveDialogOpen(true);
			return;
		}
		startNewSession();
	}, [
		session.elapsedSeconds,
		session.endSession,
		session.ended,
		sessionIsSaved,
		startNewSession,
	]);
	const handleNewSessionShortcut = useCallback(
		(event: KeyboardEvent) => {
			if (!session.ended) {
				return;
			}
			event.preventDefault();
			requestNewSession();
		},
		[requestNewSession, session.ended]
	);

	useEffect(() => {
		requestPersistentSessionStorage().catch(() => false);
	}, []);

	const warnBeforeUnload = sessionNeedsUnloadWarning(session.ended, session.elapsedSeconds);
	useEffect(() => {
		if (!warnBeforeUnload) {
			return;
		}
		const confirmActiveSessionExit = (event: BeforeUnloadEvent) => {
			requestUnloadConfirmation(event);
		};
		window.addEventListener('beforeunload', confirmActiveSessionExit);
		return () => window.removeEventListener('beforeunload', confirmActiveSessionExit);
	}, [warnBeforeUnload]);

	useEffect(() => {
		trainer.setKeyboardControlsEnabled(dashboardKeyboardEnabled);
		trainer.setGearControlsEnabled(click.paired);
	}, [
		click.paired,
		dashboardKeyboardEnabled,
		trainer.setGearControlsEnabled,
		trainer.setKeyboardControlsEnabled,
	]);

	useEffect(() => {
		const shortcutHandlers: Record<AppShortcut, (event: KeyboardEvent) => void> = {
			endSession: (event) => {
				if (saveDialogOpen || shortcutsOpen || session.ended) {
					return;
				}
				event.preventDefault();
				endSession();
			},
			history: (event) => {
				if (saveDialogOpen) {
					return;
				}
				event.preventDefault();
				setShortcutsOpen(false);
				setHistoryOpen(true);
			},
			newSession: (event) => {
				if (!(saveDialogOpen || shortcutsOpen)) {
					handleNewSessionShortcut(event);
				}
			},
			pause: (event) => {
				if (saveDialogOpen || shortcutsOpen) {
					return;
				}
				event.preventDefault();
				session.togglePause();
			},
			shortcuts: (event) => {
				if (saveDialogOpen) {
					return;
				}
				event.preventDefault();
				setHistoryOpen(false);
				setShortcutsOpen(true);
			},
		};
		const handleShortcut = (event: KeyboardEvent) => {
			if (devicesOpen || welcomeOpen || shouldIgnoreShortcut(event)) {
				return;
			}
			if (historyOpen) {
				return;
			}
			const shortcut = appShortcutForKey(event);
			if (shortcut) {
				shortcutHandlers[shortcut](event);
			}
		};
		window.addEventListener('keydown', handleShortcut);
		return () => window.removeEventListener('keydown', handleShortcut);
	}, [
		devicesOpen,
		endSession,
		handleNewSessionShortcut,
		historyOpen,
		saveDialogOpen,
		session.ended,
		session.togglePause,
		shortcutsOpen,
		welcomeOpen,
	]);

	function selectSpeedUnit(unit: SpeedUnit) {
		setSpeedUnit(unit);
		localStorage.setItem('speed-unit', unit);
	}

	function closeSaveDialog() {
		setSaveDialogOpen(false);
		setStartAfterSave(false);
		setContinuationAfterSave(undefined);
	}

	async function saveCurrentSession(metadata: SessionMetadata) {
		setSaving(true);
		try {
			const saved = createSavedSession(session.snapshot, metadata);
			await saveSession(saved);
			session.markSaved(saved.id);
			if (startAfterSave) {
				if (continuationAfterSave) {
					continueSession(continuationAfterSave);
					trainer.setNotice('Session saved. Selected session continued.');
				} else {
					startNewSession();
					trainer.setNotice('Session saved. New session ready.');
				}
			} else {
				setSaveDialogOpen(false);
				trainer.setNotice('Session saved.');
			}
		} catch (error) {
			trainer.setNotice(
				`Session could not be saved: ${error instanceof Error ? error.message : String(error)}`
			);
		} finally {
			setSaving(false);
		}
	}

	const closeHistory = useCallback(() => setHistoryOpen(false), []);
	const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
	const closeWelcome = useCallback((dontShowAgain: boolean) => {
		if (dontShowAgain) {
			rememberWelcomeDismissal();
		}
		setWelcomeOpen(false);
	}, []);
	const startNewSessionFromHistory = useCallback(
		(savedSession: SavedSession) => {
			setHistoryOpen(false);
			const currentNeedsSave =
				(session.ended && !sessionIsSaved) ||
				(!session.ended && session.elapsedSeconds > 0);
			if (currentNeedsSave) {
				if (!session.ended) {
					session.endSession();
				}
				setContinuationAfterSave(savedSession);
				setStartAfterSave(true);
				setSaveDialogOpen(true);
				return;
			}
			continueSession(savedSession);
		},
		[continueSession, session.elapsedSeconds, session.endSession, session.ended, sessionIsSaved]
	);
	const proceedWithoutSaving = useCallback(() => {
		if (continuationAfterSave) {
			continueSession(continuationAfterSave);
		} else {
			startNewSession();
		}
	}, [continuationAfterSave, continueSession, startNewSession]);

	const unitFactor = speedUnit === 'mph' ? 0.621_371 : 1;
	const distanceUnit = speedUnit === 'mph' ? 'mi' : 'km';
	const displayedSpeed = liveMetrics.speed * unitFactor;
	const displayedDistance = session.rideDistance * unitFactor;
	const displayedMaximumSpeed = session.maximums.speed * unitFactor;
	const averageSpeed =
		session.elapsedSeconds > 0 ? session.rideDistance / (session.elapsedSeconds / 3600) : 0;
	const displayedAverageSpeed = averageSpeed * unitFactor;
	const connectedDeviceCount =
		Number(trainer.connected) + Number(heartRate.connected) + click.connectedCount;
	const pairedDeviceCount = Number(trainer.paired) + Number(heartRate.paired) + click.pairedCount;
	const devicesConnecting = [
		trainer.connectionBusy,
		heartRate.busy,
		click.busy,
		click.pairing,
	].some(Boolean);
	let sessionControlLabel = 'Auto paused';
	let sessionControlIcon = 'stop';
	if (isRiding) {
		sessionControlLabel = 'Pause';
		sessionControlIcon = 'pause';
	}
	if (manuallyPaused) {
		sessionControlLabel = 'Resume';
		sessionControlIcon = 'play';
	}

	return (
		<main className="min-h-screen bg-ink selection:bg-mint/30">
			<div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
				<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
					<div className="flex flex-wrap items-center gap-2">
						{session.ended ? (
							<>
								{sessionIsSaved ? null : (
									<button
										className="h-10 rounded-lg border border-mint/40 bg-mint/10 px-3 font-semibold text-mint text-xs hover:bg-mint/15"
										onClick={() => {
											setStartAfterSave(false);
											setSaveDialogOpen(true);
										}}
										type="button"
									>
										Save session
									</button>
								)}
								<button
									className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
									onClick={requestNewSession}
									type="button"
								>
									Start new session
								</button>
							</>
						) : (
							<>
								<button
									className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 font-semibold text-xs transition ${isRiding ? 'border-mint/40 bg-mint/10 text-mint' : 'border-line bg-[#12171d] text-slate-400'}`}
									onClick={session.togglePause}
									type="button"
								>
									<Icon className="h-4 w-4" name={sessionControlIcon} />
									{sessionControlLabel}
								</button>
								<button
									className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-400 text-xs hover:border-rose-400/50 hover:text-rose-300"
									onClick={endSession}
									type="button"
								>
									End session
								</button>
							</>
						)}
					</div>
					<div className="flex items-center gap-3">
						<button
							className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
							onClick={() => {
								setShortcutsOpen(false);
								setHistoryOpen(true);
							}}
							type="button"
						>
							History
						</button>
						<div className="flex h-10 rounded-lg border border-line bg-[#10151a] p-1">
							<button
								className={`rounded px-2.5 py-1 font-bold text-[11px] ${speedUnit === 'kmh' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
								onClick={() => selectSpeedUnit('kmh')}
								type="button"
							>
								KM/H
							</button>
							<button
								className={`rounded px-2.5 py-1 font-bold text-[11px] ${speedUnit === 'mph' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
								onClick={() => selectSpeedUnit('mph')}
								type="button"
							>
								MPH
							</button>
						</div>
						<button
							aria-label="Show keyboard controls"
							className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-[#12171d] font-bold text-slate-400 text-sm hover:border-slate-500 hover:text-white"
							onClick={() => {
								setHistoryOpen(false);
								setShortcutsOpen(true);
							}}
							type="button"
						>
							?
						</button>
						<DevicePairingButton
							connectedCount={connectedDeviceCount}
							connecting={devicesConnecting}
							onClick={() => setDevicesOpen(true)}
							pairedCount={pairedDeviceCount}
						/>
					</div>
				</div>

				<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<Metric
						accent="sky"
						average={displayedAverageSpeed.toFixed(1)}
						icon="speed"
						label="SPEED"
						maximum={displayedMaximumSpeed.toFixed(1)}
						unit={speedUnit === 'mph' ? 'mph' : 'km/h'}
						value={displayedSpeed.toFixed(1)}
					/>
					<Metric
						accent="yellow"
						average={formatAggregateAverage(session.aggregates.power, 0)}
						icon="bolt"
						label="POWER"
						maximum={String(Math.round(session.maximums.power))}
						unit="watts"
						value={String(liveMetrics.power)}
					/>
					<Metric
						accent="violet"
						average={formatAggregateAverage(session.aggregates.cadence, 0)}
						icon="cadence"
						label="CADENCE"
						maximum={String(Math.round(session.maximums.cadence))}
						unit="rpm"
						value={String(Math.round(liveMetrics.cadence))}
					/>
					<Metric
						accent="rose"
						average={formatAggregateAverage(session.aggregates.heartRate, 0)}
						icon="heart"
						label="HEART RATE"
						maximum={String(Math.round(session.maximums.heartRate))}
						unit="bpm"
						value={String(liveMetrics.heartRate || '—')}
					/>
				</section>

				<section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.55fr]">
					<div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
						<div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-slate-500 bg-[#12171d]">
							<SmallMetric
								label="TIME"
								value={formatDuration(session.elapsedSeconds)}
							/>
							<SmallMetric
								label="DISTANCE"
								value={`${displayedDistance.toFixed(2)} ${distanceUnit}`}
							/>
							<SmallMetric
								label="CALORIES"
								value={`${Math.round(session.rideCalories)} kcal`}
							/>
						</div>
						<SessionChart
							controlMode={session.controlMode}
							history={session.history}
							keyboardEnabled={dashboardKeyboardEnabled}
							route={EMPTY_ROUTE}
							speedUnit={speedUnit}
						/>
					</div>
					<div className="self-start rounded-2xl border border-line bg-panel p-4 sm:p-5">
						<div className="flex items-center justify-between gap-4">
							<h2 className="font-bold text-lg">
								{click.paired ? 'Virtual shifting' : 'Resistance control'}
							</h2>
							<div className="text-right">
								<output className="font-bold text-3xl text-mint tabular-nums tracking-tight">
									{click.paired ? gearControl.gear : trainer.resistance}
									<span className="ml-1 text-slate-500 text-xs">
										{click.paired ? 'of 24' : '%'}
									</span>
								</output>
							</div>
						</div>
						{click.paired ? (
							<GearControl
								disabled={!connected}
								gear={gearControl.gear}
								onChange={gearControl.shiftGear}
								shiftFlash={gearControl.shiftFlash}
							/>
						) : (
							<ResistanceControl
								disabled={!connected}
								keyboardFlash={trainer.resistanceKeyFlash}
								max={100}
								min={0}
								onChange={trainer.updateResistance}
								ramp={trainer.resistanceRamp}
								step={1}
								value={trainer.resistance}
							/>
						)}
					</div>
				</section>
			</div>
			<footer className="fixed bottom-3 left-4 z-20 flex items-center gap-1.5 text-[11px] text-slate-600">
				<button
					className="font-semibold tracking-wide transition hover:text-slate-400"
					onClick={() => setWelcomeOpen(true)}
					type="button"
				>
					Ride Control
				</button>
				<span aria-hidden="true">·</span>
				<a
					className="transition hover:text-slate-400"
					href="https://github.com/lookfirst"
					rel="noreferrer"
					target="_blank"
				>
					GitHub
				</a>
				<span aria-hidden="true">·</span>
				<a
					className="transition hover:text-slate-400"
					href="https://github.com/sponsors/lookfirst"
					rel="noreferrer"
					target="_blank"
				>
					Sponsor
				</a>
			</footer>
			<Notification
				connected={connected}
				notice={trainer.notice}
				onDismiss={() => trainer.setNotice('')}
			/>
			<SessionSaveDialog
				continuing={Boolean(continuationAfterSave)}
				onClose={closeSaveDialog}
				onSave={saveCurrentSession}
				onStartWithoutSaving={proceedWithoutSaving}
				open={saveDialogOpen}
				saving={saving}
				session={session.snapshot}
				speedUnit={speedUnit}
			/>
			<SessionHistory
				onClose={closeHistory}
				onStartNew={startNewSessionFromHistory}
				open={historyOpen}
				speedUnit={speedUnit}
			/>
			<DevicePairingPanel
				click={{
					...click,
					onDisconnect: click.disconnect,
					onForget: click.forget,
					onForgetController: click.forgetDevice,
					onPair: click.pair,
					onReconnect: click.reconnect,
				}}
				heartRate={{
					...heartRate,
					onDisconnect: heartRate.disconnect,
					onForget: heartRate.forget,
					onPair: heartRate.pair,
					onReconnect: heartRate.reconnect,
				}}
				onClose={() => setDevicesOpen(false)}
				open={devicesOpen}
				trainer={{
					busy: trainer.connectionBusy,
					connected: trainer.connected,
					name: trainer.pairedDeviceName,
					onDisconnect: trainer.disconnect,
					onForget: trainer.forget,
					onPair: trainer.connect,
					onReconnect: trainer.reconnect,
					paired: trainer.paired,
					status: trainer.status,
				}}
			/>
			<KeyboardShortcutsDialog
				onClose={closeShortcuts}
				open={shortcutsOpen}
				shortcuts={click.paired ? gearingKeyboardShortcuts : undefined}
			/>
			<WelcomeDialog onClose={closeWelcome} open={welcomeOpen} />
		</main>
	);
}
