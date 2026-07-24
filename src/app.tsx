import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppFooter } from './components/app-footer';
import { BuildDetailsDialog } from './components/build-details-dialog';
import { Dashboard, DashboardToolbar, DashboardWorkspace } from './components/dashboard-layout';
import { DashboardTools } from './components/dashboard-tools';
import { DevicePairingPanel } from './components/device-pairing';
import { KeyboardShortcutsDialog } from './components/keyboard-shortcuts-dialog';
import { PrivacyPolicyDialog, TermsOfServiceDialog } from './components/legal-dialog';
import { Notification } from './components/notification';
import { ProfileDialog } from './components/profile-dialog';
import { RideMetrics } from './components/ride-metrics';
import { SessionControls } from './components/session-controls';
import { SessionHistory } from './components/session-history';
import { SessionOverview } from './components/session-overview';
import { SessionSaveDialog } from './components/session-save-dialog';
import { TrainingControl } from './components/training-control';
import { WelcomeDialog } from './components/welcome-dialog';
import { WorkoutPanel } from './components/workout-panel';
import { WorkoutProgress } from './components/workout-progress';
import { emptySession } from './constants';
import { useGearControl } from './hooks/use-gear-control';
import { useHeartRateMonitor } from './hooks/use-heart-rate-monitor';
import { useProfile } from './hooks/use-profile';
import { useRememberedBluetoothDevices } from './hooks/use-remembered-bluetooth-devices';
import { useSession } from './hooks/use-session';
import { useSessionWorkflow } from './hooks/use-session-workflow';
import { useTrainer } from './hooks/use-trainer';
import { useWorkoutResistance } from './hooks/use-workout';
import { useWorkoutLibrary } from './hooks/use-workout-library';
import { useZwiftClick } from './hooks/use-zwift-click';
import {
	APP_OVERLAY,
	type AppOverlay,
	isSideTrayOverlay,
	loadOpenSideTray,
	persistOpenSideTray,
} from './lib/app-overlay';
import {
	APP_ROUTE_KIND,
	APP_ROUTE_PATH,
	type AppRoute,
	appRouteFromRouterMatch,
	appRouteSideTray,
	HOME_APP_ROUTE,
} from './lib/app-route';
import {
	loadBikeGpxBrowserOpen,
	loadBikeGpxBrowserSearch,
	persistBikeGpxBrowserOpen,
} from './lib/bikegpx-browser-preferences';
import {
	CONTROL_MODE,
	trainingControlMode,
	virtualShiftingConnectionReady,
} from './lib/control-mode';
import { eventTargetsInteractiveControl, keyboardEventHasModifiers } from './lib/dom';
import { unreachable } from './lib/errors';
import { maximumGear, resistanceForVirtualGear } from './lib/gears';
import { type AppShortcut, appShortcutForKey, gearingKeyboardShortcuts } from './lib/keyboard';
import { profileTotalMassKg, type RiderProfile } from './lib/profile';
import { sessionNeedsUnloadWarning } from './lib/session';
import { requestUnloadConfirmation } from './lib/unload';
import { rememberWelcomeDismissal, shouldShowWelcome } from './lib/welcome';
import {
	workoutDashboardPreview,
	workoutSelectionLocked,
	workoutTerrainAtDistance,
} from './lib/workouts';
import { clickConnectionActiveForSession } from './lib/zwift-click';
import { preferencesStore } from './stores/preferences-store';
import type { Metrics, SavedSession, StoredSession, WorkoutCourse } from './types';

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

function personalizedWorkoutResistance({
	gear,
	profile,
	profileReady,
	terrainResistance,
	virtualShiftingActive,
}: {
	gear: number;
	profile: RiderProfile;
	profileReady: boolean;
	terrainResistance?: number;
	virtualShiftingActive: boolean;
}): number | undefined {
	if (!(profileReady && terrainResistance !== undefined)) {
		return;
	}
	return virtualShiftingActive
		? resistanceForVirtualGear(terrainResistance, gear, profile, profileTotalMassKg(profile))
		: terrainResistance;
}

interface InitialNavigation {
	overlay?: AppOverlay;
	route: AppRoute;
}

function restoredRoute(overlay: AppOverlay | undefined): AppRoute {
	if (overlay === APP_OVERLAY.DEVICES) {
		return { kind: APP_ROUTE_KIND.DEVICES };
	}
	if (overlay === APP_OVERLAY.HISTORY) {
		return { kind: APP_ROUTE_KIND.SESSION };
	}
	if (overlay === APP_OVERLAY.WORKOUTS) {
		if (loadBikeGpxBrowserOpen()) {
			return {
				kind: APP_ROUTE_KIND.BIKEGPX,
				routeId: loadBikeGpxBrowserSearch().selectedRouteId || undefined,
			};
		}
		return { kind: APP_ROUTE_KIND.WORKOUT };
	}
	return HOME_APP_ROUTE;
}

function initialNavigation(linkedRoute: AppRoute, pathname: string): InitialNavigation {
	const linkedOverlay = appRouteSideTray(linkedRoute);
	if (linkedOverlay) {
		return { overlay: linkedOverlay, route: linkedRoute };
	}
	if (pathname !== APP_ROUTE_PATH.HOME) {
		return { route: HOME_APP_ROUTE };
	}
	const restoredOverlay = loadOpenSideTray();
	return {
		overlay: restoredOverlay ?? (shouldShowWelcome() ? APP_OVERLAY.WELCOME : undefined),
		route: restoredRoute(restoredOverlay),
	};
}

export function App({ initialSession = emptySession }: { initialSession?: StoredSession }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const routerMatch = useRouterState({
		select: (state) => state.matches.at(-1),
	});
	const matchedAppRoute = useMemo(() => appRouteFromRouterMatch(routerMatch), [routerMatch]);
	const navigate = useNavigate();
	const [initialAppNavigation] = useState(() => initialNavigation(matchedAppRoute, pathname));
	const restoringRoute = useRef(
		pathname === APP_ROUTE_PATH.HOME &&
			initialAppNavigation.route.kind !== APP_ROUTE_KIND.HOME &&
			matchedAppRoute.kind === APP_ROUTE_KIND.HOME
	);
	const appRoute = restoringRoute.current ? initialAppNavigation.route : matchedAppRoute;
	const rememberedDevices = useRememberedBluetoothDevices();
	const riderProfile = useProfile();
	const trainer = useTrainer(rememberedDevices, riderProfile.profile);
	const [activeOverlay, setActiveOverlayState] = useState<AppOverlay | undefined>(
		initialAppNavigation.overlay
	);
	const navigateToAppRoute = useCallback(
		(route: AppRoute, replace = false) => {
			const overlay = appRouteSideTray(route);
			persistBikeGpxBrowserOpen(route.kind === APP_ROUTE_KIND.BIKEGPX);
			persistOpenSideTray(overlay);
			switch (route.kind) {
				case APP_ROUTE_KIND.BIKEGPX:
					if (route.routeId) {
						navigate({
							params: { routeId: route.routeId },
							replace,
							to: APP_ROUTE_PATH.BIKEGPX_ROUTE,
						}).catch(() => undefined);
					} else {
						navigate({ replace, to: APP_ROUTE_PATH.BIKEGPX }).catch(() => undefined);
					}
					return;
				case APP_ROUTE_KIND.DEVICES:
					navigate({ replace, to: APP_ROUTE_PATH.DEVICES }).catch(() => undefined);
					return;
				case APP_ROUTE_KIND.HOME:
					navigate({ replace, to: APP_ROUTE_PATH.HOME }).catch(() => undefined);
					return;
				case APP_ROUTE_KIND.SESSION:
					if (route.sessionId) {
						navigate({
							params: { sessionId: route.sessionId },
							replace,
							to: APP_ROUTE_PATH.SESSION,
						}).catch(() => undefined);
					} else {
						navigate({ replace, to: APP_ROUTE_PATH.SESSIONS }).catch(() => undefined);
					}
					return;
				case APP_ROUTE_KIND.WORKOUT:
					if (route.workoutId) {
						navigate({
							params: { workoutId: route.workoutId },
							replace,
							to: APP_ROUTE_PATH.WORKOUT,
						}).catch(() => undefined);
					} else {
						navigate({ replace, to: APP_ROUTE_PATH.WORKOUTS }).catch(() => undefined);
					}
					return;
				default:
					return unreachable(route);
			}
		},
		[navigate]
	);
	const setActiveOverlay = useCallback(
		(overlay: AppOverlay | undefined) => {
			if (overlay === APP_OVERLAY.DEVICES) {
				navigateToAppRoute({ kind: APP_ROUTE_KIND.DEVICES });
				return;
			}
			if (overlay === APP_OVERLAY.HISTORY) {
				navigateToAppRoute({ kind: APP_ROUTE_KIND.SESSION });
				return;
			}
			if (overlay === APP_OVERLAY.WORKOUTS) {
				navigateToAppRoute({ kind: APP_ROUTE_KIND.WORKOUT });
				return;
			}
			persistBikeGpxBrowserOpen(false);
			persistOpenSideTray(overlay);
			setActiveOverlayState(overlay);
			navigate({ replace: true, to: APP_ROUTE_PATH.HOME }).catch(() => undefined);
		},
		[navigate, navigateToAppRoute]
	);
	useEffect(() => {
		if (restoringRoute.current) {
			restoringRoute.current = false;
			navigateToAppRoute(initialAppNavigation.route, true);
			return;
		}
		const routeOverlay = appRouteSideTray(matchedAppRoute);
		persistBikeGpxBrowserOpen(matchedAppRoute.kind === APP_ROUTE_KIND.BIKEGPX);
		persistOpenSideTray(routeOverlay);
		setActiveOverlayState((currentOverlay) => {
			if (routeOverlay) {
				return routeOverlay;
			}
			return isSideTrayOverlay(currentOverlay) ? undefined : currentOverlay;
		});
	}, [initialAppNavigation.route, matchedAppRoute, navigateToAppRoute]);
	const devicesOpen = activeOverlay === APP_OVERLAY.DEVICES;
	const clickShiftRef = useRef<(change: number) => void>(() => undefined);
	const handleClickShift = useCallback((change: number) => clickShiftRef.current(change), []);
	const heartRate = useHeartRateMonitor(rememberedDevices, trainer.setNotice);
	const click = useZwiftClick(
		handleClickShift,
		trainer.setNotice,
		devicesOpen,
		rememberedDevices
	);
	const liveMetrics = metricsWithHeartRate(
		trainer.metrics,
		heartRate.connected,
		heartRate.heartRate
	);
	const { connected } = trainer;
	const speedUnit = useSelector(preferencesStore, (preferences) => preferences.speedUnit);
	const workoutLibrary = useWorkoutLibrary();
	const virtualShiftingReady = virtualShiftingConnectionReady({
		trainerConnected: trainer.connected,
	});
	const profileMaximumGear = maximumGear(riderProfile.profile);
	const gearResistanceRef = useRef<(fromGear: number, toGear: number) => void>(
		trainer.shiftResistanceForGears
	);
	const handleGearChange = useCallback(
		(fromGear: number, toGear: number) => gearResistanceRef.current(fromGear, toGear),
		[]
	);
	const gearControl = useGearControl({
		active: true,
		maximumGear: profileMaximumGear,
		onGearChange: handleGearChange,
		ready: virtualShiftingReady,
		setNotice: trainer.setNotice,
	});
	const pairedControlMode = trainingControlMode(click.paired, false);
	const session = useSession(
		liveMetrics,
		{
			gear: gearControl.gear,
			mode: pairedControlMode,
			resistance: trainer.resistance,
		},
		trainer.lastPedalingAt,
		trainer.trainerReportsDistance,
		initialSession,
		riderProfile.ready ? riderProfile.profile : undefined
	);
	const dashboardWorkout = workoutDashboardPreview({
		distance: session.rideDistance,
		elevationTotals: session.elevationTotals,
		ended: session.ended,
		selectedWorkout: session.selectedWorkout,
		workout: session.workout,
	});
	const workoutTerrain = dashboardWorkout.workout
		? workoutTerrainAtDistance(dashboardWorkout.workout.course, dashboardWorkout.distance)
		: undefined;
	const workoutSelected = Boolean(dashboardWorkout.workout);
	const virtualShiftingActive = click.paired || workoutSelected;
	const activeControlMode = trainingControlMode(click.paired, workoutSelected);
	const workoutResistance = personalizedWorkoutResistance({
		gear: gearControl.gear,
		profile: riderProfile.profile,
		profileReady: riderProfile.ready,
		terrainResistance: workoutTerrain?.resistance,
		virtualShiftingActive,
	});
	gearResistanceRef.current = workoutTerrain
		? (_fromGear, toGear) =>
				trainer.updateProgramShiftResistance(
					resistanceForVirtualGear(
						workoutTerrain.resistance,
						toGear,
						riderProfile.profile,
						profileTotalMassKg(riderProfile.profile)
					)
				)
		: trainer.shiftResistanceForGears;
	useWorkoutResistance({
		active: !session.ended && riderProfile.ready,
		connected: trainer.connected,
		onResistanceChange: trainer.updateProgramResistance,
		onRestoreResistance: trainer.restoreManualResistance,
		resistance: workoutResistance,
	});
	const workflow = useSessionWorkflow(session, trainer.setNotice, trainer.settleAfterRide);
	const workoutLocked = workoutSelectionLocked(session);
	const clickConnectionActive = clickConnectionActiveForSession(session);
	useEffect(() => {
		click.setConnectionActive(clickConnectionActive);
	}, [click.setConnectionActive, clickConnectionActive]);
	const dashboardKeyboardEnabled = activeOverlay === undefined && !workflow.saveDialogOpen;
	clickShiftRef.current = shiftHandlerUnlessBlocked(
		gearControl.shiftGear,
		!(dashboardKeyboardEnabled && virtualShiftingActive)
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
		trainer.setKeyboardControlsEnabled(dashboardKeyboardEnabled && !dashboardWorkout.workout);
		trainer.setGearControlsEnabled(virtualShiftingActive);
		gearControl.setKeyboardControlsEnabled(dashboardKeyboardEnabled && virtualShiftingActive);
	}, [
		dashboardKeyboardEnabled,
		gearControl.setKeyboardControlsEnabled,
		trainer.setGearControlsEnabled,
		trainer.setKeyboardControlsEnabled,
		dashboardWorkout.workout,
		virtualShiftingActive,
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
				setActiveOverlay(APP_OVERLAY.HISTORY);
			},
			newSession: handleNewSessionShortcut,
			pause: (event) => {
				event.preventDefault();
				session.togglePause();
			},
			shortcuts: (event) => {
				event.preventDefault();
				setActiveOverlay(APP_OVERLAY.SHORTCUTS);
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
		setActiveOverlay,
		workflow.endSession,
		workflow.saveDialogOpen,
	]);

	const closeWelcome = useCallback(
		(dontShowAgain: boolean) => {
			if (dontShowAgain) {
				rememberWelcomeDismissal();
			}
			setActiveOverlay(undefined);
		},
		[setActiveOverlay]
	);
	const continueFromHistory = useCallback(
		(savedSession: SavedSession) => {
			setActiveOverlay(undefined);
			workflow.requestContinuation(savedSession);
		},
		[setActiveOverlay, workflow.requestContinuation]
	);
	const selectWorkout = useCallback(
		(course?: WorkoutCourse) => {
			session.selectWorkout(course);
			setActiveOverlay(undefined);
		},
		[session.selectWorkout, setActiveOverlay]
	);
	const selectedWorkoutCourse = session.selectedWorkout
		? session.selectedWorkout.course
		: undefined;
	const selectedWorkoutId = selectedWorkoutCourse ? selectedWorkoutCourse.id : undefined;
	const bikeGpxBrowserOpen = appRoute.kind === APP_ROUTE_KIND.BIKEGPX;
	const bikeGpxRouteId = bikeGpxBrowserOpen ? appRoute.routeId : undefined;
	const focusedWorkoutId =
		appRoute.kind === APP_ROUTE_KIND.WORKOUT ? appRoute.workoutId : undefined;
	const requestedSessionId =
		appRoute.kind === APP_ROUTE_KIND.SESSION ? appRoute.sessionId : undefined;
	const focusWorkout = useCallback(
		(courseId: string | undefined) => {
			navigateToAppRoute({ kind: APP_ROUTE_KIND.WORKOUT, workoutId: courseId }, true);
		},
		[navigateToAppRoute]
	);
	const openBikeGpx = useCallback(() => {
		navigateToAppRoute({ kind: APP_ROUTE_KIND.BIKEGPX });
	}, [navigateToAppRoute]);
	const closeBikeGpx = useCallback(() => {
		navigateToAppRoute({ kind: APP_ROUTE_KIND.WORKOUT }, true);
	}, [navigateToAppRoute]);
	const selectBikeGpxRoute = useCallback(
		(routeId: string | undefined) => {
			navigateToAppRoute({ kind: APP_ROUTE_KIND.BIKEGPX, routeId }, true);
		},
		[navigateToAppRoute]
	);
	const selectHistorySession = useCallback(
		(sessionId: string) => {
			navigateToAppRoute({ kind: APP_ROUTE_KIND.SESSION, sessionId }, true);
		},
		[navigateToAppRoute]
	);
	useEffect(() => {
		if (!selectedWorkoutCourse) {
			return;
		}
		const currentDefinition = workoutLibrary.courses.find(
			(course) => course.id === selectedWorkoutCourse.id
		);
		if (currentDefinition && currentDefinition !== selectedWorkoutCourse) {
			session.selectWorkout(currentDefinition);
		}
	}, [selectedWorkoutCourse, session.selectWorkout, workoutLibrary.courses]);
	const removeWorkout = useCallback(
		(courseId: string) => {
			if (selectedWorkoutId === courseId) {
				session.selectWorkout(undefined);
			}
			workoutLibrary.removeCourse(courseId);
		},
		[selectedWorkoutId, session.selectWorkout, workoutLibrary.removeCourse]
	);

	const connectedDeviceCount =
		Number(trainer.connected) + Number(heartRate.connected) + click.connectedCount;
	const pairedDeviceCount = Number(trainer.paired) + Number(heartRate.paired) + click.pairedCount;
	const workoutName = selectedWorkoutCourse ? selectedWorkoutCourse.name : undefined;
	const devicesConnecting = [
		trainer.connectionBusy,
		heartRate.busy,
		click.busy,
		click.pairingRole !== undefined,
	].some(Boolean);

	return (
		<main className="flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-ink selection:bg-mint/30">
			<Dashboard>
				<DashboardToolbar>
					<SessionControls
						ended={session.ended}
						isRiding={session.isRiding}
						manuallyPaused={session.manuallyPaused}
						onEnd={workflow.endSession}
						onOpenWorkouts={() => setActiveOverlay(APP_OVERLAY.WORKOUTS)}
						onRequestNew={workflow.requestNewSession}
						onSave={workflow.openSaveDialog}
						onTogglePause={session.togglePause}
						saveResolved={workflow.sessionIsResolved}
						workoutName={workoutName}
						workoutSelectionLocked={workoutLocked}
					/>
					<DashboardTools
						connectedDeviceCount={connectedDeviceCount}
						devicesConnecting={devicesConnecting}
						onOpenDevices={() => setActiveOverlay(APP_OVERLAY.DEVICES)}
						onOpenHistory={() => setActiveOverlay(APP_OVERLAY.HISTORY)}
						onOpenProfile={() => setActiveOverlay(APP_OVERLAY.PROFILE)}
						onOpenShortcuts={() => setActiveOverlay(APP_OVERLAY.SHORTCUTS)}
						pairedDeviceCount={pairedDeviceCount}
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
				{dashboardWorkout.workout && workoutTerrain ? (
					<WorkoutProgress
						elevationTotals={dashboardWorkout.elevationTotals}
						isRiding={session.isRiding}
						speedUnit={speedUnit}
						targetResistance={workoutResistance}
						terrain={workoutTerrain}
						workout={dashboardWorkout.workout}
					/>
				) : null}
				<DashboardWorkspace>
					<SessionOverview
						controlMode={activeControlMode}
						elapsedSeconds={session.elapsedSeconds}
						history={session.history}
						keyboardEnabled={dashboardKeyboardEnabled}
						rideCalories={session.rideCalories}
						rideDistance={session.rideDistance}
						speedUnit={speedUnit}
						workout={session.workout}
					/>
					<TrainingControl
						connected={virtualShiftingActive ? virtualShiftingReady : connected}
						control={
							virtualShiftingActive
								? {
										gear: gearControl.gear,
										maximumGear: profileMaximumGear,
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
			<AppFooter
				onOpenPrivacy={() => setActiveOverlay(APP_OVERLAY.PRIVACY)}
				onOpenTerms={() => setActiveOverlay(APP_OVERLAY.TERMS)}
				onOpenVersion={() => setActiveOverlay(APP_OVERLAY.BUILD)}
				onOpenWelcome={() => setActiveOverlay(APP_OVERLAY.WELCOME)}
			/>
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
				onSelectSessionId={selectHistorySession}
				onStartNew={continueFromHistory}
				open={activeOverlay === APP_OVERLAY.HISTORY}
				requestedSessionId={requestedSessionId}
				speedUnit={speedUnit}
			/>
			<WorkoutPanel
				activeCourse={session.selectedWorkout?.course}
				bikeGpxBrowserOpen={bikeGpxBrowserOpen}
				bikeGpxRouteId={bikeGpxRouteId}
				courses={workoutLibrary.courses}
				customCourseIds={workoutLibrary.customCourseIds}
				focusedCourseId={focusedWorkoutId}
				onClose={() => setActiveOverlay(undefined)}
				onCloseBikeGpx={closeBikeGpx}
				onFocusCourse={focusWorkout}
				onImportCourse={async (course) => workoutLibrary.importCourse(course)}
				onImportFile={workoutLibrary.importFile}
				onOpenBikeGpx={openBikeGpx}
				onRemoveCourse={removeWorkout}
				onRenameCourse={workoutLibrary.renameCourse}
				onReorderCourse={workoutLibrary.reorderCourse}
				onSelect={selectWorkout}
				onSelectBikeGpxRoute={selectBikeGpxRoute}
				open={activeOverlay === APP_OVERLAY.WORKOUTS}
				selectionLocked={workoutLocked}
				speedUnit={speedUnit}
			/>
			<DevicePairingPanel
				click={{
					...click,
					onCancel: click.disconnect,
					onDisconnect: click.disconnect,
					onForget: click.forget,
					onForgetController: click.forgetDevice,
					onPairController: click.pair,
					onReconnect: click.reconnect,
				}}
				heartRate={{
					...heartRate,
					onCancel: heartRate.cancelConnection,
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
					onCancel: trainer.cancelConnection,
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
				open={activeOverlay === APP_OVERLAY.SHORTCUTS}
				shortcuts={virtualShiftingActive ? gearingKeyboardShortcuts : undefined}
			/>
			<BuildDetailsDialog
				onClose={() => setActiveOverlay(undefined)}
				open={activeOverlay === APP_OVERLAY.BUILD}
			/>
			<PrivacyPolicyDialog
				onClose={() => setActiveOverlay(undefined)}
				open={activeOverlay === APP_OVERLAY.PRIVACY}
			/>
			<TermsOfServiceDialog
				onClose={() => setActiveOverlay(undefined)}
				open={activeOverlay === APP_OVERLAY.TERMS}
			/>
			<ProfileDialog
				onClose={() => setActiveOverlay(undefined)}
				onSave={riderProfile.save}
				onSelectSpeedUnit={preferencesStore.actions.selectSpeedUnit}
				open={activeOverlay === APP_OVERLAY.PROFILE}
				physicsSettingsLocked={warnBeforeUnload}
				profile={riderProfile.profile}
				speedUnit={speedUnit}
				storageError={riderProfile.storageError}
			/>
			<WelcomeDialog onClose={closeWelcome} open={activeOverlay === APP_OVERLAY.WELCOME} />
		</main>
	);
}
