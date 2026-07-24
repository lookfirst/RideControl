import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePersistentScrollPosition } from '../hooks/use-persistent-scroll-position';
import { formatDuration } from '../lib/format';
import {
	feelingLabel,
	formatSessionListTime,
	groupSessionsByDate,
	isImportedSession,
} from '../lib/saved-sessions';
import { SESSION_HISTORY_SCROLL_POSITION_STORAGE_KEY } from '../lib/session-history-preferences';
import { formatDistance } from '../lib/units';
import type { SavedSessionSummary, SpeedUnit } from '../types';
import { Icon } from './icon';

const SESSION_HISTORY_ROW_KIND = {
	DATE: 'date',
	SESSION: 'session',
} as const;
const SESSION_HISTORY_OVERSCAN = 6;
const SESSION_HISTORY_INITIAL_RECT = { height: 256, width: 320 };
const ESTIMATED_DATE_ROW_HEIGHT = 34;
const ESTIMATED_SESSION_ROW_HEIGHT = 68;

type SessionHistoryRow =
	| {
			date: string;
			key: string;
			kind: typeof SESSION_HISTORY_ROW_KIND.DATE;
	  }
	| {
			key: string;
			kind: typeof SESSION_HISTORY_ROW_KIND.SESSION;
			session: SavedSessionSummary;
	  };

function SessionHistorySessionRow({
	highlighted,
	onSelect,
	selected,
	session,
	speedUnit,
}: {
	highlighted: boolean;
	onSelect: () => void;
	selected: boolean;
	session: SavedSessionSummary;
	speedUnit: SpeedUnit;
}) {
	const imported = isImportedSession(session);
	return (
		<div className="pb-1">
			<button
				aria-pressed={selected}
				className={`relative w-full rounded-lg border px-3 py-2.5 text-left transition ${selected ? 'border-mint/40 bg-mint/10' : 'border-transparent hover:border-line hover:bg-slate-800/50'} ${highlighted ? 'shadow-[0_0_14px_rgba(34,211,238,0.16)] ring-1 ring-cyan-400/70' : ''}`}
				onClick={onSelect}
				type="button"
			>
				<div className="flex items-center justify-between gap-3">
					<span className="font-semibold text-sm">{formatSessionListTime(session)}</span>
					<span className="shrink-0 text-slate-500 text-xs">
						{formatDuration(session.elapsedSeconds)}
					</span>
				</div>
				<p className={`mt-1 text-slate-400 text-xs ${imported ? 'pr-5' : ''}`}>
					{formatDistance(session.distance, speedUnit)}
					{session.feeling ? ` · ${feelingLabel(session.feeling)}` : null}
					{session.workoutName ? ` · ${session.workoutName}` : null}
				</p>
				{imported ? (
					<span
						aria-label="Imported from activity file"
						className="absolute right-2.5 bottom-3 grid h-3 w-3 place-items-center text-cyan-300/70"
						role="img"
					>
						<Icon
							className="h-5 w-5"
							name="imported"
							title="Imported from activity file"
						/>
					</span>
				) : null}
			</button>
		</div>
	);
}

function SessionHistoryRowContent({
	highlightedIds,
	index,
	onSelect,
	row,
	selectedId,
	speedUnit,
}: {
	highlightedIds: Set<string>;
	index: number;
	onSelect: (id: string) => void;
	row: SessionHistoryRow;
	selectedId?: string;
	speedUnit: SpeedUnit;
}) {
	if (row.kind === SESSION_HISTORY_ROW_KIND.DATE) {
		return (
			<h3
				className={`px-2 pb-1.5 font-bold text-[10px] text-slate-500 tracking-widest ${index > 0 ? 'pt-4' : ''}`}
			>
				{row.date.toUpperCase()}
			</h3>
		);
	}
	return (
		<SessionHistorySessionRow
			highlighted={highlightedIds.has(row.session.id)}
			onSelect={() => onSelect(row.session.id)}
			selected={selectedId === row.session.id}
			session={row.session}
			speedUnit={speedUnit}
		/>
	);
}

export function SessionHistoryList({
	error,
	highlightedSessionIds,
	onLoadMore,
	onSelect,
	open,
	selectedId,
	speedUnit,
	summaries,
	total,
}: {
	error: string;
	highlightedSessionIds: string[];
	onLoadMore: () => void;
	onSelect: (id: string) => void;
	open: boolean;
	selectedId?: string;
	speedUnit: SpeedUnit;
	summaries: SavedSessionSummary[];
	total: number;
}) {
	const rows = useMemo<SessionHistoryRow[]>(
		() =>
			groupSessionsByDate(summaries).flatMap((group) => [
				{
					date: group.date,
					key: `date:${group.key}`,
					kind: SESSION_HISTORY_ROW_KIND.DATE,
				},
				...group.sessions.map((session) => ({
					key: `session:${session.id}`,
					kind: SESSION_HISTORY_ROW_KIND.SESSION,
					session,
				})),
			]),
		[summaries]
	);
	const highlightedIds = useMemo(() => new Set(highlightedSessionIds), [highlightedSessionIds]);
	const sessionListRef = useRef<HTMLElement>(null);
	const sessionListScroll = usePersistentScrollPosition<HTMLElement>(
		SESSION_HISTORY_SCROLL_POSITION_STORAGE_KEY,
		open,
		summaries.length
	);
	const setSessionListRef = useCallback(
		(element: HTMLElement | null) => {
			sessionListRef.current = element;
			sessionListScroll.ref(element);
		},
		[sessionListScroll.ref]
	);
	const rowKey = useCallback((index: number) => rows[index]?.key ?? index, [rows]);
	const estimateRowSize = useCallback(
		(index: number) =>
			rows[index]?.kind === SESSION_HISTORY_ROW_KIND.DATE
				? ESTIMATED_DATE_ROW_HEIGHT
				: ESTIMATED_SESSION_ROW_HEIGHT,
		[rows]
	);
	const rowVirtualizer = useVirtualizer({
		count: rows.length,
		estimateSize: estimateRowSize,
		getItemKey: rowKey,
		getScrollElement: () => sessionListRef.current,
		initialRect: SESSION_HISTORY_INITIAL_RECT,
		overscan: SESSION_HISTORY_OVERSCAN,
		useFlushSync: false,
	});
	const selectedRowIndex = rows.findIndex(
		(row) => row.kind === SESSION_HISTORY_ROW_KIND.SESSION && row.session.id === selectedId
	);
	const previousSelectedId = useRef(selectedId);

	useEffect(() => {
		const selectionChanged = previousSelectedId.current !== selectedId;
		const hadPreviousSelection = previousSelectedId.current !== undefined;
		previousSelectedId.current = selectedId;
		if (selectionChanged && hadPreviousSelection && selectedRowIndex >= 0) {
			rowVirtualizer.scrollToIndex(selectedRowIndex, { align: 'auto' });
		}
	}, [rowVirtualizer, selectedId, selectedRowIndex]);

	return (
		<aside
			className="max-h-64 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden border-line border-b bg-[#12171d] p-3 md:max-h-none md:w-80 md:border-r md:border-b-0"
			data-testid="session-list"
			onScroll={sessionListScroll.onScroll}
			ref={setSessionListRef}
		>
			{error ? <p className="p-3 text-rose-300 text-sm">{error}</p> : null}
			{summaries.length === 0 && !error ? (
				<div className="p-6 text-center">
					<p className="font-semibold">No saved sessions yet</p>
					<p className="mt-1 text-slate-500 text-sm">
						End a session or import a FIT or TCX file to add it here.
					</p>
				</div>
			) : null}
			{rows.length > 0 ? (
				<div
					className="relative w-full"
					data-session-history-virtualized="true"
					style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
				>
					{rowVirtualizer.getVirtualItems().map((virtualRow) => {
						const row = rows[virtualRow.index];
						if (!row) {
							return null;
						}
						return (
							<div
								className="absolute top-0 left-0 w-full"
								data-index={virtualRow.index}
								key={row.key}
								ref={rowVirtualizer.measureElement}
								style={{ transform: `translateY(${virtualRow.start}px)` }}
							>
								<SessionHistoryRowContent
									highlightedIds={highlightedIds}
									index={virtualRow.index}
									onSelect={onSelect}
									row={row}
									selectedId={selectedId}
									speedUnit={speedUnit}
								/>
							</div>
						);
					})}
				</div>
			) : null}
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
