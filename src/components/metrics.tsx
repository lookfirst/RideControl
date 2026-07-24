import { metricAccentClass, metricIconClass } from '../lib/metric-presentation';
import { Icon } from './icon';

function MetricSummary({
	label,
	rightAligned = false,
	value,
}: {
	label: string;
	rightAligned?: boolean;
	value: string;
}) {
	return (
		<div className={rightAligned ? 'text-right' : undefined}>
			<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">{label}</p>
			<p className="mt-1 font-semibold text-4xl text-white tabular-nums tracking-tight">
				{value}
			</p>
		</div>
	);
}

export function Metric({
	average,
	label,
	maximum,
	value,
	unit,
	accent,
	icon,
}: {
	average: string;
	label: string;
	maximum: string;
	value: string;
	unit: string;
	accent: string;
	icon?: string;
}) {
	return (
		<div className="rounded-2xl border border-line bg-panel p-4">
			<div className="flex items-center justify-between">
				<span className="font-bold text-slate-500 text-xs tracking-[.14em]">{label}</span>
				{icon ? (
					<Icon className={`h-5 w-5 ${metricIconClass(accent)}`} name={icon} />
				) : null}
			</div>
			<div className="mt-3 flex items-baseline gap-2">
				<span className="font-semibold text-6xl tracking-tight">{value}</span>
				<span className="text-slate-400 text-sm">{unit}</span>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-3 border-line border-t pt-3">
				<MetricSummary label="AVG" value={average} />
				<MetricSummary label="MAX" rightAligned value={maximum} />
			</div>
			<div className={`mt-2 h-1 rounded-full ${metricAccentClass(accent)}`} />
		</div>
	);
}

export function SmallMetric({
	large = false,
	label,
	unit,
	value,
}: {
	large?: boolean;
	label: string;
	unit?: string;
	value: string;
}) {
	return (
		<div className={large ? 'min-w-0 px-3 py-3 sm:px-5' : 'min-w-0 p-4 sm:p-5'}>
			<p className="font-bold text-[11px] text-slate-500 tracking-[.12em]">{label}</p>
			<p
				className={`mt-1 flex min-w-0 items-baseline gap-1.5 font-semibold tracking-tight sm:gap-2 ${large ? 'text-3xl sm:text-5xl min-[420px]:text-2xl' : 'text-lg sm:text-2xl'}`}
			>
				<span className="min-w-0">{value}</span>
				{unit ? (
					<span
						className={`shrink-0 font-medium text-slate-400 tracking-normal ${large ? 'text-sm sm:text-xl' : 'text-xs sm:text-sm'}`}
					>
						{unit}
					</span>
				) : null}
			</p>
		</div>
	);
}

export function SessionMetric({
	accent,
	average,
	icon,
	label,
	maximum,
	unit,
}: {
	accent: string;
	average: string;
	icon: string;
	label: string;
	maximum?: string;
	unit: string;
}) {
	return (
		<div className="rounded-xl border border-line bg-[#12171d] p-4">
			<div className="flex items-center justify-between gap-2">
				<p className="whitespace-nowrap font-bold text-[9px] text-slate-500 tracking-widest">
					{label}
				</p>
				<Icon className={`h-4 w-4 shrink-0 ${metricIconClass(accent)}`} name={icon} />
			</div>
			<div className="mt-3 flex items-baseline gap-2">
				<span className="font-semibold text-3xl tracking-tight sm:text-4xl">{average}</span>
				<span className="text-slate-400 text-xs">{unit}</span>
			</div>
			<div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
				<span className="font-bold text-slate-600 tracking-[.08em]">AVG</span>
				{maximum === undefined ? null : (
					<span className="pr-1 text-right text-slate-400">
						<strong className="mr-1 font-bold text-slate-600 tracking-[.08em]">
							MAX
						</strong>
						{maximum}
					</span>
				)}
			</div>
			<div className={`mt-3 h-1 rounded-full ${metricAccentClass(accent)}`} />
		</div>
	);
}
