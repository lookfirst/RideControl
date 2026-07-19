import type { ReactNode } from 'react';

export function TrainingControlPanel({
	children,
	title,
	unit,
	value,
}: {
	children: ReactNode;
	title: string;
	unit: string;
	value: number;
}) {
	return (
		<div className="self-start rounded-2xl border border-line bg-panel p-4 sm:p-5">
			<div className="flex items-center justify-between gap-4">
				<h2 className="font-bold text-lg">{title}</h2>
				<div className="text-right">
					<output className="font-bold text-3xl text-mint tabular-nums tracking-tight">
						{value}
						<span className="ml-1 text-slate-500 text-xs">{unit}</span>
					</output>
				</div>
			</div>
			{children}
		</div>
	);
}
