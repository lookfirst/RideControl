import { useEffect, useState } from 'react';
import { ConnectionControl } from './components/connection-control';
import { Icon } from './components/icon';
import { Metric, SmallMetric } from './components/metrics';
import { Notification } from './components/notification';
import { ResistanceControl } from './components/resistance-control';
import { SessionChart } from './components/session-chart';
import { useSession } from './hooks/use-session';
import { useTrainer } from './hooks/use-trainer';
import { formatAggregateAverage, formatDuration } from './lib/format';
import type { RoutePoint, SpeedUnit } from './types';

const EMPTY_ROUTE: RoutePoint[] = [];

export function App() {
	const trainer = useTrainer();
	const session = useSession(
		trainer.metrics,
		trainer.lastPedalingAt,
		trainer.trainerReportsDistance
	);
	const { connected } = trainer;
	const { isRiding, manuallyPaused } = session;
	const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(() =>
		localStorage.getItem('speed-unit') === 'kmh' ? 'kmh' : 'mph'
	);
	useEffect(() => {
		const handlePauseKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.code !== 'Space' ||
				target?.matches("button, a, input, textarea, select, [contenteditable='true']")
			) {
				return;
			}
			event.preventDefault();
			session.togglePause();
		};
		window.addEventListener('keydown', handlePauseKey);
		return () => window.removeEventListener('keydown', handlePauseKey);
	}, [session.togglePause]);

	function selectSpeedUnit(unit: SpeedUnit) {
		setSpeedUnit(unit);
		localStorage.setItem('speed-unit', unit);
	}

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
						<button
							className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-semibold text-xs transition ${isRiding ? 'border-mint/40 bg-mint/10 text-mint' : 'border-line bg-[#12171d] text-slate-400'}`}
							onClick={session.togglePause}
							type="button"
						>
							<Icon className="h-4 w-4" name={sessionControlIcon} />
							{sessionControlLabel}
							{isRiding || manuallyPaused ? null : (
								<span className="border-line border-l pl-2 text-slate-200">
									Stop
								</span>
							)}
						</button>
						<button
							className="rounded-lg border border-line bg-[#12171d] px-3 py-2 font-semibold text-slate-400 text-xs hover:text-rose-300"
							onClick={() => {
								session.reset();
								trainer.setNotice('Session reset.');
							}}
							type="button"
						>
							Reset
						</button>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex rounded-lg border border-line bg-[#10151a] p-1">
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
						<ConnectionControl
							connected={connected}
							deviceName={trainer.deviceName}
							onClick={connected ? trainer.disconnect : trainer.connect}
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
						<div className="grid grid-cols-3 divide-x divide-line rounded-xl border bg-[#12171d]">
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
		</main>
	);
}
