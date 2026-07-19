import { formatAggregateAverage, formatWholeNumber } from '../lib/format';
import { METRIC_PRESENTATION } from '../lib/metric-presentation';
import { averageSpeed, formatSpeed, speedUnitLabel } from '../lib/units';
import type { Metrics, SessionAggregates, SpeedUnit } from '../types';
import { Metric } from './metrics';

export function RideMetrics({
	aggregates,
	elapsedSeconds,
	liveMetrics,
	maximums,
	rideDistance,
	speedUnit,
}: {
	aggregates: SessionAggregates;
	elapsedSeconds: number;
	liveMetrics: Metrics;
	maximums: Metrics;
	rideDistance: number;
	speedUnit: SpeedUnit;
}) {
	const rideAverageSpeed = averageSpeed(rideDistance, elapsedSeconds);
	const { cadence, heartRate, power, speed } = METRIC_PRESENTATION;
	return (
		<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<Metric
				accent={speed.accent}
				average={formatSpeed(rideAverageSpeed, speedUnit)}
				icon={speed.icon}
				label={speed.label.toUpperCase()}
				maximum={formatSpeed(maximums.speed, speedUnit)}
				unit={speedUnitLabel(speedUnit)}
				value={formatSpeed(liveMetrics.speed, speedUnit)}
			/>
			<Metric
				accent={power.accent}
				average={formatAggregateAverage(aggregates.power, 0)}
				icon={power.icon}
				label={power.label.toUpperCase()}
				maximum={formatWholeNumber(maximums.power)}
				unit={power.dashboardUnit}
				value={String(liveMetrics.power)}
			/>
			<Metric
				accent={cadence.accent}
				average={formatAggregateAverage(aggregates.cadence, 0)}
				icon={cadence.icon}
				label={cadence.label.toUpperCase()}
				maximum={formatWholeNumber(maximums.cadence)}
				unit={cadence.dashboardUnit}
				value={formatWholeNumber(liveMetrics.cadence)}
			/>
			<Metric
				accent={heartRate.accent}
				average={formatAggregateAverage(aggregates.heartRate, 0)}
				icon={heartRate.icon}
				label={heartRate.label.toUpperCase()}
				maximum={formatWholeNumber(maximums.heartRate)}
				unit={heartRate.dashboardUnit}
				value={String(liveMetrics.heartRate || '—')}
			/>
		</section>
	);
}
