import { Icon } from './icon';

export function metricAccentClass(accent: string): string {
	if (accent === 'sky') {
		return 'bg-sky-400';
	}
	if (accent === 'yellow') {
		return 'bg-yellow-400';
	}
	if (accent === 'violet') {
		return 'bg-violet-400';
	}
	if (accent === 'rose') {
		return 'bg-rose-400';
	}
	return 'bg-mint';
}

export function metricIconClass(accent: string): string {
	if (accent === 'mint') {
		return 'text-mint';
	}
	if (accent === 'yellow') {
		return 'text-yellow-400';
	}
	if (accent === 'violet') {
		return 'text-violet-400';
	}
	if (accent === 'rose') {
		return 'text-rose-400';
	}
	return 'text-sky-400';
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
		<div className="rounded-2xl border border-line bg-panel p-5">
			<div className="flex items-center justify-between">
				<span className="font-bold text-slate-500 text-xs tracking-[.14em]">{label}</span>
				{icon ? <Icon className={metricIconClass(accent)} name={icon} /> : null}
			</div>
			<div className="mt-4 flex items-baseline gap-2">
				<span className="font-semibold text-4xl tracking-tight">{value}</span>
				<span className="text-slate-400 text-sm">{unit}</span>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-3 border-line border-t pt-3">
				<div>
					<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">AVG</p>
					<p className="mt-1 flex items-baseline gap-1 font-semibold text-2xl text-white tabular-nums tracking-tight">
						<span>{average}</span>
						<span className="font-medium text-slate-300 text-xs">{unit}</span>
					</p>
				</div>
				<div className="text-right">
					<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">MAX</p>
					<p className="mt-1 flex items-baseline justify-end gap-1 font-semibold text-2xl text-white tabular-nums tracking-tight">
						<span>{maximum}</span>
						<span className="font-medium text-slate-300 text-xs">{unit}</span>
					</p>
				</div>
			</div>
			<div className={`mt-3 h-1 rounded-full ${metricAccentClass(accent)}`} />
		</div>
	);
}

export function SmallMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="p-4 sm:p-5">
			<p className="font-bold text-[11px] text-slate-500 tracking-[.12em]">{label}</p>
			<p className="mt-1 font-semibold text-lg tracking-tight sm:text-2xl">{value}</p>
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
			<div className="flex items-center justify-between gap-3">
				<p className="font-bold text-[10px] text-slate-500 tracking-[.14em]">{label}</p>
				<Icon className={`h-4 w-4 ${metricIconClass(accent)}`} name={icon} />
			</div>
			<div className="mt-3 flex items-baseline gap-2">
				<span className="font-semibold text-3xl tracking-tight sm:text-4xl">{average}</span>
				<span className="text-slate-400 text-xs">{unit}</span>
			</div>
			<div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
				<span className="font-bold text-slate-600 tracking-[.08em]">AVERAGE</span>
				{maximum === undefined ? null : (
					<span className="text-right text-slate-400">
						<strong className="mr-1 font-bold text-slate-600 tracking-[.08em]">
							MAX
						</strong>
						{maximum} {unit}
					</span>
				)}
			</div>
			<div className={`mt-3 h-1 rounded-full ${metricAccentClass(accent)}`} />
		</div>
	);
}
