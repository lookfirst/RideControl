import { useMemo } from 'react';
import { formatDuration } from '../lib/format';
import {
	feelingLabel,
	formatSessionListTime,
	groupSessionsByDate,
	isImportedSession,
} from '../lib/saved-sessions';
import { formatDistance } from '../lib/units';
import type { SavedSessionSummary, SpeedUnit } from '../types';
import { Icon } from './icon';

export function SessionHistoryList({
	error,
	highlightedSessionIds,
	onLoadMore,
	onSelect,
	selectedId,
	speedUnit,
	summaries,
	total,
}: {
	error: string;
	highlightedSessionIds: string[];
	onLoadMore: () => void;
	onSelect: (id: string) => void;
	selectedId?: string;
	speedUnit: SpeedUnit;
	summaries: SavedSessionSummary[];
	total: number;
}) {
	const groups = useMemo(() => groupSessionsByDate(summaries), [summaries]);
	const highlightedIds = useMemo(() => new Set(highlightedSessionIds), [highlightedSessionIds]);

	return (
		<aside className="max-h-64 shrink-0 overflow-y-auto border-line border-b bg-[#12171d] p-3 md:max-h-none md:w-80 md:border-r md:border-b-0">
			{error ? <p className="p-3 text-rose-300 text-sm">{error}</p> : null}
			{summaries.length === 0 && !error ? (
				<div className="p-6 text-center">
					<p className="font-semibold">No saved sessions yet</p>
					<p className="mt-1 text-slate-500 text-sm">
						End a session or import a TCX file to add it here.
					</p>
				</div>
			) : null}
			{groups.map((group) => (
				<div className="mb-4" key={group.key}>
					<h3 className="px-2 pb-1.5 font-bold text-[10px] text-slate-500 tracking-widest">
						{group.date.toUpperCase()}
					</h3>
					<div className="space-y-1">
						{group.sessions.map((session) => {
							const highlighted = highlightedIds.has(session.id);
							const imported = isImportedSession(session);
							return (
								<button
									className={`relative w-full rounded-lg border px-3 py-2.5 text-left transition ${selectedId === session.id ? 'border-mint/40 bg-mint/10' : 'border-transparent hover:border-line hover:bg-slate-800/50'} ${highlighted ? 'shadow-[0_0_14px_rgba(34,211,238,0.16)] ring-1 ring-cyan-400/70' : ''}`}
									key={session.id}
									onClick={() => onSelect(session.id)}
									type="button"
								>
									<div className="flex items-center justify-between gap-3">
										<span className="font-semibold text-sm">
											{formatSessionListTime(session)}
										</span>
										<span className="shrink-0 text-slate-500 text-xs">
											{formatDuration(session.elapsedSeconds)}
										</span>
									</div>
									<p
										className={`mt-1 text-slate-400 text-xs ${imported ? 'pr-5' : ''}`}
									>
										{formatDistance(session.distance, speedUnit)}
										{session.feeling
											? ` · ${feelingLabel(session.feeling)}`
											: null}
									</p>
									{imported ? (
										<span
											aria-label="Imported from TCX file"
											className="absolute right-2.5 bottom-3 grid h-3 w-3 place-items-center text-cyan-300/70"
											role="img"
										>
											<Icon
												className="h-5 w-5"
												name="imported"
												title="Imported from TCX file"
											/>
										</span>
									) : null}
								</button>
							);
						})}
					</div>
				</div>
			))}
			{summaries.length < total ? (
				<button
					className="w-full rounded-lg border border-line px-3 py-2 font-semibold text-slate-400 text-xs hover:border-slate-500 hover:text-white"
					onClick={onLoadMore}
					type="button"
				>
					Load more
				</button>
			) : null}
		</aside>
	);
}
