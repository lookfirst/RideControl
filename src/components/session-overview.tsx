import { EMPTY_ROUTE } from '../constants';
import type { ControlMode, MetricSample, SessionWorkout, SpeedUnit } from '../types';
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
	workout,
}: {
	controlMode: ControlMode;
	elapsedSeconds: number;
	history: MetricSample[];
	keyboardEnabled: boolean;
	rideCalories: number;
	rideDistance: number;
	speedUnit: SpeedUnit;
	workout?: SessionWorkout;
}) {
	return (
		<div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
			<div className="grid grid-cols-3 divide-x divide-line rounded-xl bg-[#12171d] ring-1 ring-slate-500 ring-inset">
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
				route={workout?.course.points ?? EMPTY_ROUTE}
				speedUnit={speedUnit}
			/>
		</div>
	);
}
