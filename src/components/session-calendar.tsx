import { useEffect, useMemo, useState } from 'react';
import { formatDuration } from '../lib/format';
import { formatSessionListTime } from '../lib/saved-sessions';
import { localSessionDateKey } from '../lib/session-analytics';
import {
	moveSessionCalendarMonth,
	sessionCalendarDays,
	sessionCalendarMonth,
} from '../lib/session-calendar';
import { formatDistance } from '../lib/units';
import type { SavedSessionSummary, SpeedUnit } from '../types';

const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, {
	month: 'long',
	year: 'numeric',
});
const DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
	day: 'numeric',
	month: 'long',
	weekday: 'long',
});
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function CalendarSessionButton({
	onSelect,
	selected,
	session,
	speedUnit,
}: {
	onSelect: () => void;
	selected: boolean;
	session: SavedSessionSummary;
	speedUnit: SpeedUnit;
}) {
	return (
		<button
			aria-pressed={selected}
			className={`block w-full truncate rounded px-1 py-0.5 text-left font-semibold text-[9px] transition ${
				selected
					? 'bg-mint/20 text-mint ring-1 ring-mint/40'
					: 'bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20'
			}`}
			onClick={onSelect}
			title={`${formatSessionListTime(session)} · ${formatDistance(session.distance, speedUnit)}`}
			type="button"
		>
			{formatSessionListTime(session)}
		</button>
	);
}

function CalendarDaySessions({
	onSelect,
	selectedId,
	sessions,
	speedUnit,
}: {
	onSelect: (id: string) => void;
	selectedId?: string;
	sessions: SavedSessionSummary[];
	speedUnit: SpeedUnit;
}) {
	return (
		<div className="mt-2 space-y-1">
			{sessions.map((session) => (
				<button
					aria-pressed={selectedId === session.id}
					className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
						selectedId === session.id
							? 'border-mint/40 bg-mint/10'
							: 'border-line bg-slate-900/30 hover:border-cyan-400/40 hover:bg-slate-800/60'
					}`}
					key={session.id}
					onClick={() => onSelect(session.id)}
					type="button"
				>
					<span className="min-w-0">
						<span className="block font-semibold text-sm">
							{formatSessionListTime(session)}
						</span>
						<span className="block truncate text-slate-400 text-xs">
							{session.workoutName ?? 'Indoor ride'}
						</span>
					</span>
					<span className="shrink-0 text-right">
						<span className="block font-semibold text-slate-200 text-xs">
							{formatDistance(session.distance, speedUnit)}
						</span>
						<span className="block text-[10px] text-slate-500">
							{formatDuration(session.elapsedSeconds)}
						</span>
					</span>
				</button>
			))}
		</div>
	);
}

export function SessionCalendar({
	error,
	loading,
	month,
	onChangeMonth,
	onSelect,
	selectedId,
	speedUnit,
	summaries,
}: {
	error: string;
	loading: boolean;
	month: Date;
	onChangeMonth: (month: Date) => void;
	onSelect: (id: string) => void;
	selectedId?: string;
	speedUnit: SpeedUnit;
	summaries: SavedSessionSummary[];
}) {
	const normalizedMonth = sessionCalendarMonth(month);
	const days = useMemo(
		() => sessionCalendarDays(normalizedMonth, summaries),
		[normalizedMonth, summaries]
	);
	const selectedSession = summaries.find((session) => session.id === selectedId);
	const selectedSessionDayKey = selectedSession
		? localSessionDateKey(selectedSession.startedAt)
		: undefined;
	const selectedSessionIsVisible = days.some(
		(day) => day.inCurrentMonth && day.key === selectedSessionDayKey
	);
	const initialDayKey =
		selectedSessionIsVisible && selectedSessionDayKey
			? selectedSessionDayKey
			: (days.find((day) => day.inCurrentMonth && day.sessions.length > 0)?.key ??
				localSessionDateKey(normalizedMonth.getTime()));
	const [selectedDayKey, setSelectedDayKey] = useState(initialDayKey);

	useEffect(() => {
		if (selectedSessionIsVisible && selectedSessionDayKey) {
			setSelectedDayKey(selectedSessionDayKey);
			return;
		}
		if (!days.some((day) => day.key === selectedDayKey && day.inCurrentMonth)) {
			setSelectedDayKey(
				days.find((day) => day.inCurrentMonth && day.sessions.length > 0)?.key ??
					localSessionDateKey(normalizedMonth.getTime())
			);
		}
	}, [days, normalizedMonth, selectedDayKey, selectedSessionDayKey, selectedSessionIsVisible]);

	const selectedDay = days.find((day) => day.key === selectedDayKey);
	const monthTotals = summaries.reduce(
		(totals, session) => ({
			distance: totals.distance + session.distance,
			elapsedSeconds: totals.elapsedSeconds + session.elapsedSeconds,
		}),
		{ distance: 0, elapsedSeconds: 0 }
	);

	return (
		<aside
			className="max-h-112 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden border-line border-b bg-[#12171d] p-3 md:max-h-none md:w-md md:border-r md:border-b-0"
			data-testid="session-calendar"
		>
			<div className="flex items-center justify-between gap-2">
				<button
					aria-label="Previous month"
					className="grid h-9 w-9 place-items-center rounded-lg border border-line text-lg text-slate-300 hover:border-cyan-400/50 hover:text-white"
					onClick={() => onChangeMonth(moveSessionCalendarMonth(normalizedMonth, -1))}
					type="button"
				>
					‹
				</button>
				<div className="min-w-0 text-center">
					<h3 className="truncate font-bold text-base">
						{MONTH_FORMATTER.format(normalizedMonth)}
					</h3>
					<p className="mt-0.5 text-[10px] text-slate-500">
						{summaries.length} {summaries.length === 1 ? 'ride' : 'rides'} ·{' '}
						{formatDistance(monthTotals.distance, speedUnit, 1)} ·{' '}
						{formatDuration(monthTotals.elapsedSeconds)}
					</p>
				</div>
				<button
					aria-label="Next month"
					className="grid h-9 w-9 place-items-center rounded-lg border border-line text-lg text-slate-300 hover:border-cyan-400/50 hover:text-white"
					onClick={() => onChangeMonth(moveSessionCalendarMonth(normalizedMonth, 1))}
					type="button"
				>
					›
				</button>
			</div>
			<button
				className="mx-auto mt-2 block rounded-md px-2 py-1 font-semibold text-[10px] text-cyan-300 hover:bg-cyan-400/10"
				onClick={() => onChangeMonth(sessionCalendarMonth(new Date()))}
				type="button"
			>
				Today
			</button>
			{error ? (
				<p className="mt-3 rounded-lg bg-rose-400/10 p-3 text-rose-300 text-sm">{error}</p>
			) : null}
			<div className="mt-3 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
				{WEEKDAYS.map((weekday) => (
					<div
						className="bg-slate-900/90 py-1.5 text-center font-bold text-[9px] text-slate-500 uppercase tracking-wide"
						key={weekday}
					>
						{weekday}
					</div>
				))}
				{days.map((day) => {
					const selected = day.key === selectedDayKey;
					let dayNumberClass = 'text-slate-500 hover:bg-slate-800';
					if (day.sessions.length > 0) {
						dayNumberClass = 'text-white hover:bg-slate-700';
					}
					if (selected) {
						dayNumberClass = 'bg-mint text-ink';
					}
					return (
						<div
							className={`min-h-14 min-w-0 bg-[#12171d] p-1 sm:min-h-20 ${
								day.inCurrentMonth ? '' : 'opacity-30'
							} ${selected ? 'ring-1 ring-mint ring-inset' : ''}`}
							key={day.key}
						>
							<button
								aria-label={`${DAY_FORMATTER.format(day.date)}, ${day.sessions.length} ${
									day.sessions.length === 1 ? 'ride' : 'rides'
								}`}
								className={`grid h-6 w-6 place-items-center rounded-full font-semibold text-[10px] ${dayNumberClass}`}
								onClick={() => setSelectedDayKey(day.key)}
								type="button"
							>
								{day.date.getDate()}
							</button>
							{day.sessions.length > 0 ? (
								<>
									<div className="mt-1 flex flex-wrap gap-0.5 px-0.5 sm:hidden">
										{day.sessions.slice(0, 4).map((session) => (
											<span
												className="h-1.5 w-1.5 rounded-full bg-cyan-300"
												key={session.id}
											/>
										))}
									</div>
									<div className="mt-1 hidden space-y-1 sm:block">
										{day.sessions.slice(0, 2).map((session) => (
											<CalendarSessionButton
												key={session.id}
												onSelect={() => {
													setSelectedDayKey(day.key);
													onSelect(session.id);
												}}
												selected={selectedId === session.id}
												session={session}
												speedUnit={speedUnit}
											/>
										))}
										{day.sessions.length > 2 ? (
											<p className="px-1 text-[8px] text-slate-500">
												+{day.sessions.length - 2} more
											</p>
										) : null}
									</div>
								</>
							) : null}
						</div>
					);
				})}
			</div>
			<div className="mt-4 border-line border-t pt-3">
				<div className="flex items-center justify-between gap-3">
					<h4 className="font-bold text-sm">
						{selectedDay ? DAY_FORMATTER.format(selectedDay.date) : 'Select a day'}
					</h4>
					{selectedDay?.sessions.length ? (
						<span className="text-[10px] text-slate-500">
							{selectedDay.sessions.length}{' '}
							{selectedDay.sessions.length === 1 ? 'ride' : 'rides'}
						</span>
					) : null}
				</div>
				{selectedDay?.sessions.length ? (
					<CalendarDaySessions
						onSelect={onSelect}
						selectedId={selectedId}
						sessions={selectedDay.sessions}
						speedUnit={speedUnit}
					/>
				) : (
					<p className="mt-2 rounded-lg border border-line border-dashed p-4 text-center text-slate-500 text-xs">
						{loading ? 'Loading rides…' : 'No rides on this day'}
					</p>
				)}
			</div>
		</aside>
	);
}
