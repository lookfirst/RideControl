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
		<div className="min-w-0 rounded-2xl border border-line bg-panel p-3 sm:p-4">
			<div className="grid min-w-0 grid-cols-1 divide-y divide-line rounded-xl bg-[#12171d] ring-1 ring-slate-500 ring-inset min-[420px]:grid-cols-3 min-[420px]:divide-x min-[420px]:divide-y-0">
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
				route={workout ? workout.course.points : EMPTY_ROUTE}
				speedUnit={speedUnit}
			/>
		</div>
	);
}
