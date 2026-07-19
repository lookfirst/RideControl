import { EMPTY_ROUTE } from '../constants';
import type { ControlMode, MetricSample, SpeedUnit } from '../types';
import { SessionChart } from './session-chart';
import { SessionSummary } from './session-summary';

export function SessionOverview({
	controlMode,
	elapsedSeconds,
	history,
	keyboardEnabled,
	rideCalories,
	rideDistance,
	speedUnit,
}: {
	controlMode: ControlMode;
	elapsedSeconds: number;
	history: MetricSample[];
	keyboardEnabled: boolean;
	rideCalories: number;
	rideDistance: number;
	speedUnit: SpeedUnit;
}) {
	return (
		<div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
			<div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-slate-500 bg-[#12171d]">
				<SessionSummary
					calories={rideCalories}
					distance={rideDistance}
					elapsedSeconds={elapsedSeconds}
					large
					speedUnit={speedUnit}
				/>
			</div>
			<SessionChart
				controlMode={controlMode}
				history={history}
				keyboardEnabled={keyboardEnabled}
				route={EMPTY_ROUTE}
				speedUnit={speedUnit}
			/>
		</div>
	);
}
