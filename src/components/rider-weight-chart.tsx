import { poundsForKilograms, type RiderWeightEntry } from '../lib/profile';
import { profileWeightUnit } from '../lib/profile-form';
import type { SpeedUnit } from '../types';

const WEIGHT_FORMATTER = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
	minimumFractionDigits: 1,
});
const WEIGHT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
});
const CHART_LEFT = 4;
const CHART_RIGHT = 96;
const CHART_TOP = 5;
const CHART_BOTTOM = 49;
const CHART_HEIGHT = 54;

interface WeightChartPoint {
	date: string;
	recordedAt: number;
	value: number;
	x: number;
	y: number;
}

function displayedWeight(weightKg: number, speedUnit: SpeedUnit): number {
	return speedUnit === 'mph' ? poundsForKilograms(weightKg) : weightKg;
}

function weightChartPoints(
	entries: readonly RiderWeightEntry[],
	speedUnit: SpeedUnit
): WeightChartPoint[] {
	const sorted = [...entries].sort((left, right) => left.recordedAt - right.recordedAt);
	if (sorted.length === 0) {
		return [];
	}
	const values = sorted.map((entry) => displayedWeight(entry.weightKg, speedUnit));
	const minimumTime = sorted[0]?.recordedAt ?? 0;
	const maximumTime = sorted.at(-1)?.recordedAt ?? minimumTime;
	const minimumValue = Math.min(...values);
	const maximumValue = Math.max(...values);
	const valueRange = maximumValue - minimumValue;
	const padding = Math.max(0.5, valueRange * 0.2);
	const chartMinimum = minimumValue - padding;
	const chartMaximum = maximumValue + padding;
	const chartRange = chartMaximum - chartMinimum;
	return sorted.map((entry, index) => ({
		date: WEIGHT_DATE_FORMATTER.format(entry.recordedAt),
		recordedAt: entry.recordedAt,
		value: values[index] ?? 0,
		x:
			maximumTime === minimumTime
				? (CHART_LEFT + CHART_RIGHT) / 2
				: CHART_LEFT +
					((entry.recordedAt - minimumTime) / (maximumTime - minimumTime)) *
						(CHART_RIGHT - CHART_LEFT),
		y:
			CHART_BOTTOM -
			(((values[index] ?? 0) - chartMinimum) / chartRange) * (CHART_BOTTOM - CHART_TOP),
	}));
}

function weightLinePath(points: readonly WeightChartPoint[]): string {
	return points
		.map(
			(point, index) =>
				`${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
		)
		.join(' ');
}

function weightAreaPath(points: readonly WeightChartPoint[]): string {
	const [first] = points;
	const last = points.at(-1);
	if (!(first && last)) {
		return '';
	}
	return `${weightLinePath(points)} L${last.x.toFixed(2)} ${CHART_BOTTOM} L${first.x.toFixed(2)} ${CHART_BOTTOM} Z`;
}

function formattedWeightChange(change: number): string {
	const normalizedChange = Math.abs(change) < 0.05 ? 0 : change;
	if (normalizedChange === 0) {
		return WEIGHT_FORMATTER.format(0);
	}
	return `${normalizedChange > 0 ? '+' : '−'}${WEIGHT_FORMATTER.format(
		Math.abs(normalizedChange)
	)}`;
}

export function RiderWeightChart({
	compact = false,
	entries,
	speedUnit,
}: {
	compact?: boolean;
	entries: readonly RiderWeightEntry[];
	speedUnit: SpeedUnit;
}) {
	const points = weightChartPoints(entries, speedUnit);
	const [first] = points;
	const latest = points.at(-1);
	if (!(first && latest)) {
		return null;
	}
	const unit = profileWeightUnit(speedUnit);
	const weightChange = latest.value - first.value;
	const linePath = weightLinePath(points);
	const endpointPoints = points.length > 1 ? [first, latest] : [];
	return (
		<figure
			aria-label={`Weight over time from ${first.date} to ${latest.date}`}
			className={`min-w-0 overflow-hidden rounded-2xl border border-line bg-[#10151a] ${
				compact ? 'mt-3 p-4' : 'mt-3 p-5'
			}`}
			data-testid="rider-weight-chart"
			data-weight-chart-size={compact ? 'compact' : 'full'}
		>
			<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
				<div>
					<p className="font-bold text-[10px] text-slate-500 uppercase tracking-[0.16em]">
						Current
					</p>
					<p className="mt-1 font-bold text-3xl text-slate-100 leading-none">
						{WEIGHT_FORMATTER.format(latest.value)}{' '}
						<span className="font-normal text-slate-500 text-sm">{unit}</span>
					</p>
				</div>
				<div className="text-right">
					<p className="font-bold text-[10px] text-slate-500 uppercase tracking-[0.16em]">
						Change
					</p>
					<p className="mt-1 font-bold text-lg text-mint leading-none">
						{formattedWeightChange(weightChange)}{' '}
						<span className="font-normal text-slate-500 text-xs">{unit}</span>
					</p>
					<p className="mt-1 text-[10px] text-slate-600">since {first.date}</p>
				</div>
			</div>
			{points.length > 1 ? (
				<div
					className={`relative mt-5 overflow-hidden rounded-xl bg-slate-950/25 ${
						compact ? 'h-28' : 'h-44'
					}`}
					data-weight-plot="true"
				>
					<svg
						aria-hidden="true"
						className="absolute inset-0 h-full w-full"
						preserveAspectRatio="none"
						viewBox={`0 0 100 ${CHART_HEIGHT}`}
					>
						<path
							d={weightAreaPath(points)}
							data-weight-area="true"
							fill="#86efac"
							fillOpacity="0.08"
						/>
						<path
							d={linePath}
							data-weight-line="true"
							fill="none"
							stroke="#adf5bd"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
					{endpointPoints.map((point, index) => (
						<span
							aria-hidden="true"
							className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
								index === endpointPoints.length - 1
									? 'border-mint bg-[#10151a] shadow-[0_0_0_4px_rgba(134,239,172,0.12)]'
									: 'border-slate-500 bg-[#10151a]'
							}`}
							data-weight-point="true"
							key={`${point.recordedAt}-${point.value}`}
							style={{
								left: `${point.x}%`,
								top: `${(point.y / CHART_HEIGHT) * 100}%`,
							}}
						/>
					))}
				</div>
			) : (
				<div className="mt-5 grid min-h-24 place-items-center rounded-xl bg-slate-950/25 px-4 text-center">
					<p className="whitespace-nowrap text-slate-500 text-sm">
						Save another weight to see your trend.
					</p>
				</div>
			)}
			<figcaption className="mt-3 flex items-center justify-between gap-3 text-[10px] text-slate-500">
				<time dateTime={new Date(first.recordedAt).toISOString()}>{first.date}</time>
				{latest.recordedAt === first.recordedAt ? (
					<span>1 measurement</span>
				) : (
					<>
						<span>{points.length} measurements</span>
						<time dateTime={new Date(latest.recordedAt).toISOString()}>
							{latest.date}
						</time>
					</>
				)}
			</figcaption>
		</figure>
	);
}
