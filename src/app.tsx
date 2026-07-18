import { useCallback, useEffect, useState } from 'react';
import { ConnectionControl } from './components/connection-control';
import { Icon } from './components/icon';
import { KeyboardShortcutsDialog } from './components/keyboard-shortcuts-dialog';
import { Metric, SmallMetric } from './components/metrics';
import { Notification } from './components/notification';
import { ResistanceControl } from './components/resistance-control';
import { SessionChart } from './components/session-chart';
import { SessionHistory } from './components/session-history';
import { SessionSaveDialog } from './components/session-save-dialog';
import { useSession } from './hooks/use-session';
import { useTrainer } from './hooks/use-trainer';
import { formatAggregateAverage, formatDuration } from './lib/format';
import { type AppShortcut, appShortcutForKey } from './lib/keyboard';
import {
	createSavedSession,
	requestPersistentSessionStorage,
	saveSession,
} from './lib/saved-sessions';
import type { RoutePoint, SessionMetadata, SpeedUnit } from './types';

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

export function App() {
	const trainer = useTrainer();
	const session = useSession(
		trainer.metrics,
		trainer.resistance,
		trainer.lastPedalingAt,
		trainer.trainerReportsDistance
	);
	const { connected } = trainer;
	const { isRiding, manuallyPaused } = session;
	const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(() =>
		localStorage.getItem('speed-unit') === 'kmh' ? 'kmh' : 'mph'
	);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [saveDialogOpen, setSaveDialogOpen] = useState(
		() => session.ended && !session.savedSessionId
	);
	const [saving, setSaving] = useState(false);
	const startNewSession = useCallback(() => {
		session.startNew();
		setSaveDialogOpen(false);
		trainer.setNotice('New session ready.');
	}, [session.startNew, trainer.setNotice]);
	const handleNewSessionShortcut = useCallback(
		(event: KeyboardEvent) => {
			if (!session.ended) {
				return;
			}
			event.preventDefault();
			if (session.savedSessionId) {
				startNewSession();
			} else {
				setSaveDialogOpen(true);
			}
		},
		[session.ended, session.savedSessionId, startNewSession]
	);

	useEffect(() => {
		requestPersistentSessionStorage().catch(() => false);
	}, []);

	useEffect(() => {
		trainer.setKeyboardControlsEnabled(!(historyOpen || shortcutsOpen));
	}, [historyOpen, shortcutsOpen, trainer.setKeyboardControlsEnabled]);

	useEffect(() => {
		const shortcutHandlers: Record<AppShortcut, (event: KeyboardEvent) => void> = {
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
			if (shouldIgnoreShortcut(event)) {
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
	}, [handleNewSessionShortcut, historyOpen, saveDialogOpen, session.togglePause, shortcutsOpen]);

	function selectSpeedUnit(unit: SpeedUnit) {
		setSpeedUnit(unit);
		localStorage.setItem('speed-unit', unit);
	}

	function endSession() {
		session.endSession();
		setSaveDialogOpen(true);
	}

	async function saveCurrentSession(metadata: SessionMetadata) {
		setSaving(true);
		try {
			const saved = createSavedSession(session.snapshot, metadata);
			await saveSession(saved);
			session.markSaved(saved.id);
			setSaveDialogOpen(false);
			trainer.setNotice('Session saved.');
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

	const unitFactor = speedUnit === 'mph' ? 0.621_371 : 1;
	const distanceUnit = speedUnit === 'mph' ? 'mi' : 'km';
	const displayedSpeed = trainer.metrics.speed * unitFactor;
	const displayedDistance = session.rideDistance * unitFactor;
	const displayedMaximumSpeed = session.maximums.speed * unitFactor;
	const averageSpeed =
		session.elapsedSeconds > 0 ? session.rideDistance / (session.elapsedSeconds / 3600) : 0;
	const displayedAverageSpeed = averageSpeed * unitFactor;
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
								{session.savedSessionId ? null : (
									<button
										className="h-10 rounded-lg border border-mint/40 bg-mint/10 px-3 font-semibold text-mint text-xs hover:bg-mint/15"
										onClick={() => setSaveDialogOpen(true)}
										type="button"
									>
										Save session
									</button>
								)}
								<button
									className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
									onClick={() =>
										session.savedSessionId
											? startNewSession()
											: setSaveDialogOpen(true)
									}
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
						<ConnectionControl
							busy={trainer.connectionBusy}
							connected={connected}
							deviceName={trainer.deviceName}
							onCancel={trainer.cancelConnection}
							onConnect={trainer.connect}
							onDisconnect={trainer.disconnect}
							status={trainer.status}
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
						value={String(trainer.metrics.power)}
					/>
					<Metric
						accent="violet"
						average={formatAggregateAverage(session.aggregates.cadence, 0)}
						icon="cadence"
						label="CADENCE"
						maximum={String(Math.round(session.maximums.cadence))}
						unit="rpm"
						value={String(Math.round(trainer.metrics.cadence))}
					/>
					<Metric
						accent="rose"
						average={formatAggregateAverage(session.aggregates.heartRate, 0)}
						icon="heart"
						label="HEART RATE"
						maximum={String(Math.round(session.maximums.heartRate))}
						unit="bpm"
						value={String(trainer.metrics.heartRate || '—')}
					/>
				</section>

				<section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
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
							history={session.history}
							keyboardEnabled={!(historyOpen || shortcutsOpen)}
							route={EMPTY_ROUTE}
							speedUnit={speedUnit}
						/>
					</div>
					<div className="self-start rounded-2xl border border-line bg-panel p-4 sm:p-5">
						<div className="flex items-center justify-between gap-4">
							<h2 className="font-bold text-lg">Resistance control</h2>
							<output className="font-bold text-3xl text-mint tabular-nums tracking-tight">
								{trainer.resistance}
								<span className="ml-0.5 text-lg">%</span>
							</output>
						</div>
						<ResistanceControl
							disabled={!connected}
							max={100}
							min={0}
							onChange={trainer.updateResistance}
							step={1}
							value={trainer.resistance}
						/>
					</div>
				</section>
			</div>
			<Notification
				connected={connected}
				notice={trainer.notice}
				onDismiss={() => trainer.setNotice('')}
			/>
			<SessionSaveDialog
				onClose={() => setSaveDialogOpen(false)}
				onSave={saveCurrentSession}
				onStartWithoutSaving={startNewSession}
				open={saveDialogOpen}
				saving={saving}
				session={session.snapshot}
				speedUnit={speedUnit}
			/>
			<SessionHistory onClose={closeHistory} open={historyOpen} speedUnit={speedUnit} />
			<KeyboardShortcutsDialog onClose={closeShortcuts} open={shortcutsOpen} />
		</main>
	);
}
