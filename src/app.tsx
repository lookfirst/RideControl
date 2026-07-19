import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppFooter } from './components/app-footer';
import { Dashboard, DashboardToolbar, DashboardWorkspace } from './components/dashboard-layout';
import { DashboardTools } from './components/dashboard-tools';
import { DevicePairingPanel } from './components/device-pairing';
import { KeyboardShortcutsDialog } from './components/keyboard-shortcuts-dialog';
import { Notification } from './components/notification';
import { RideMetrics } from './components/ride-metrics';
import { SessionControls } from './components/session-controls';
import { SessionHistory } from './components/session-history';
import { SessionOverview } from './components/session-overview';
import { SessionSaveDialog } from './components/session-save-dialog';
import { TrainingControl } from './components/training-control';
import { WelcomeDialog } from './components/welcome-dialog';
import { useGearControl } from './hooks/use-gear-control';
import { useHeartRateMonitor } from './hooks/use-heart-rate-monitor';
import { useSession } from './hooks/use-session';
import { useSessionWorkflow } from './hooks/use-session-workflow';
import { useTrainer } from './hooks/use-trainer';
import { useZwiftClick } from './hooks/use-zwift-click';
import { CONTROL_MODE, type ControlMode } from './lib/control-mode';
import { eventTargetsInteractiveControl, keyboardEventHasModifiers } from './lib/dom';
import { type AppShortcut, appShortcutForKey, gearingKeyboardShortcuts } from './lib/keyboard';
import { requestUnloadConfirmation, sessionNeedsUnloadWarning } from './lib/session';
import { rememberWelcomeDismissal, shouldShowWelcome } from './lib/welcome';
import { MAX_CLICK_CONTROLLERS } from './lib/zwift-click';
import { preferencesStore } from './stores/preferences-store';
import type { Metrics, SavedSession } from './types';

type AppOverlay = 'devices' | 'history' | 'shortcuts' | 'welcome';

function shouldIgnoreShortcut(event: KeyboardEvent) {
	return (
		event.defaultPrevented ||
		keyboardEventHasModifiers(event) ||
		eventTargetsInteractiveControl(event)
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
	return paired ? CONTROL_MODE.GEAR : CONTROL_MODE.RESISTANCE;
}

export function App() {
	const trainer = useTrainer();
	const [activeOverlay, setActiveOverlay] = useState<AppOverlay | undefined>(() =>
		shouldShowWelcome() ? 'welcome' : undefined
	);
	const devicesOpen = activeOverlay === 'devices';
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
	const speedUnit = useSelector(preferencesStore, (preferences) => preferences.speedUnit);
	const virtualShiftingReady =
		trainer.connected && click.connectedCount === MAX_CLICK_CONTROLLERS;
	const gearControl = useGearControl({
		active: click.paired,
		onResistanceChange: trainer.shiftResistanceBy,
		ready: virtualShiftingReady,
		resistance: trainer.resistance,
		setNotice: trainer.setNotice,
	});
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
	const workflow = useSessionWorkflow(session, trainer.setNotice);
	const dashboardKeyboardEnabled = activeOverlay === undefined && !workflow.saveDialogOpen;
	clickShiftRef.current = shiftHandlerUnlessBlocked(
		gearControl.shiftGear,
		!dashboardKeyboardEnabled
	);
	const handleNewSessionShortcut = useCallback(
		(event: KeyboardEvent) => {
			if (!session.ended) {
				return;
			}
			event.preventDefault();
			workflow.requestNewSession();
		},
		[session.ended, workflow.requestNewSession]
	);

	useEffect(() => {
		workflow.requestPersistentStorage();
	}, [workflow.requestPersistentStorage]);

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
		gearControl.setKeyboardControlsEnabled(dashboardKeyboardEnabled);
	}, [
		click.paired,
		dashboardKeyboardEnabled,
		gearControl.setKeyboardControlsEnabled,
		trainer.setGearControlsEnabled,
		trainer.setKeyboardControlsEnabled,
	]);

	useEffect(() => {
		const shortcutHandlers: Record<AppShortcut, (event: KeyboardEvent) => void> = {
			endSession: (event) => {
				if (session.ended) {
					return;
				}
				event.preventDefault();
				workflow.endSession();
			},
			history: (event) => {
				event.preventDefault();
				setActiveOverlay('history');
			},
			newSession: handleNewSessionShortcut,
			pause: (event) => {
				event.preventDefault();
				session.togglePause();
			},
			shortcuts: (event) => {
				event.preventDefault();
				setActiveOverlay('shortcuts');
			},
		};
		const handleShortcut = (event: KeyboardEvent) => {
			if (
				activeOverlay !== undefined ||
				workflow.saveDialogOpen ||
				shouldIgnoreShortcut(event)
			) {
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
		activeOverlay,
		handleNewSessionShortcut,
		session.ended,
		session.togglePause,
		workflow.endSession,
		workflow.saveDialogOpen,
	]);

	const closeWelcome = useCallback((dontShowAgain: boolean) => {
		if (dontShowAgain) {
			rememberWelcomeDismissal();
		}
		setActiveOverlay(undefined);
	}, []);
	const continueFromHistory = useCallback(
		(savedSession: SavedSession) => {
			setActiveOverlay(undefined);
			workflow.requestContinuation(savedSession);
		},
		[workflow.requestContinuation]
	);

	const connectedDeviceCount =
		Number(trainer.connected) + Number(heartRate.connected) + click.connectedCount;
	const pairedDeviceCount = Number(trainer.paired) + Number(heartRate.paired) + click.pairedCount;
	const devicesConnecting = [
		trainer.connectionBusy,
		heartRate.busy,
		click.busy,
		click.pairing,
	].some(Boolean);

	return (
		<main className="min-h-screen bg-ink selection:bg-mint/30">
			<Dashboard>
				<DashboardToolbar>
					<SessionControls
						ended={session.ended}
						isRiding={session.isRiding}
						manuallyPaused={session.manuallyPaused}
						onEnd={workflow.endSession}
						onRequestNew={workflow.requestNewSession}
						onSave={workflow.openSaveDialog}
						onTogglePause={session.togglePause}
						saveResolved={workflow.sessionIsResolved}
					/>
					<DashboardTools
						connectedDeviceCount={connectedDeviceCount}
						devicesConnecting={devicesConnecting}
						onOpenDevices={() => setActiveOverlay('devices')}
						onOpenHistory={() => setActiveOverlay('history')}
						onOpenShortcuts={() => setActiveOverlay('shortcuts')}
						onSelectSpeedUnit={preferencesStore.actions.selectSpeedUnit}
						pairedDeviceCount={pairedDeviceCount}
						speedUnit={speedUnit}
					/>
				</DashboardToolbar>
				<RideMetrics
					aggregates={session.aggregates}
					elapsedSeconds={session.elapsedSeconds}
					liveMetrics={liveMetrics}
					maximums={session.maximums}
					rideDistance={session.rideDistance}
					speedUnit={speedUnit}
				/>
				<DashboardWorkspace>
					<SessionOverview
						controlMode={session.controlMode}
						elapsedSeconds={session.elapsedSeconds}
						history={session.history}
						keyboardEnabled={dashboardKeyboardEnabled}
						rideCalories={session.rideCalories}
						rideDistance={session.rideDistance}
						speedUnit={speedUnit}
					/>
					<TrainingControl
						connected={click.paired ? virtualShiftingReady : connected}
						control={
							click.paired
								? {
										gear: gearControl.gear,
										mode: CONTROL_MODE.GEAR,
										onShift: gearControl.shiftGear,
										shiftFlash: gearControl.shiftFlash,
									}
								: {
										keyboardFlash: trainer.resistanceKeyFlash,
										mode: CONTROL_MODE.RESISTANCE,
										onChange: trainer.updateResistance,
										ramp: trainer.resistanceRamp,
										resistance: trainer.resistance,
									}
						}
					/>
				</DashboardWorkspace>
			</Dashboard>
			<AppFooter onOpenWelcome={() => setActiveOverlay('welcome')} />
			<Notification
				connected={connected}
				notice={trainer.notice}
				onDismiss={() => trainer.setNotice('')}
			/>
			<SessionSaveDialog
				intent={workflow.saveDialogIntent}
				onClose={workflow.closeSaveDialog}
				onSave={workflow.saveCurrentSession}
				onStartWithoutSaving={workflow.proceedWithoutSaving}
				open={workflow.saveDialogOpen}
				saving={workflow.saving}
				session={session.snapshot}
				speedUnit={speedUnit}
			/>
			<SessionHistory
				onClose={() => setActiveOverlay(undefined)}
				onStartNew={continueFromHistory}
				open={activeOverlay === 'history'}
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
				onClose={() => setActiveOverlay(undefined)}
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
					phase: trainer.phase,
					reconnecting: trainer.reconnecting,
					status: trainer.status,
				}}
			/>
			<KeyboardShortcutsDialog
				onClose={() => setActiveOverlay(undefined)}
				open={activeOverlay === 'shortcuts'}
				shortcuts={click.paired ? gearingKeyboardShortcuts : undefined}
			/>
			<WelcomeDialog onClose={closeWelcome} open={activeOverlay === 'welcome'} />
		</main>
	);
}
