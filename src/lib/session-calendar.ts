import { z } from 'zod';
import type { SavedSessionSummary } from '../types';
import { localSessionDateKey } from './session-analytics';

export const sessionCalendarMonthKeySchema = z.string().regex(/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/);

export interface SessionCalendarDay {
	date: Date;
	inCurrentMonth: boolean;
	key: string;
	sessions: SavedSessionSummary[];
}

export function sessionCalendarMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function sessionCalendarMonthFromKey(value: unknown): Date | undefined {
	const parsed = sessionCalendarMonthKeySchema.safeParse(value);
	if (!parsed.success) {
		return;
	}
	const [year, month] = parsed.data.split('-').map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, 1);
}

export function sessionCalendarMonthKey(date: Date): string {
	const month = sessionCalendarMonth(date);
	return `${month.getFullYear()}-${(month.getMonth() + 1).toString().padStart(2, '0')}`;
}

export function moveSessionCalendarMonth(date: Date, months: number): Date {
	return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function sessionsByLocalDate(
	summaries: SavedSessionSummary[]
): Map<string, SavedSessionSummary[]> {
	const grouped = new Map<string, SavedSessionSummary[]>();
	for (const session of summaries) {
		const date = new Date(session.startedAt);
		date.setHours(0, 0, 0, 0);
		const lastDate = new Date(
			session.elapsedSeconds > 0 && session.endedAt > session.startedAt
				? session.endedAt
				: session.startedAt
		);
		lastDate.setHours(0, 0, 0, 0);
		while (date <= lastDate) {
			const key = localSessionDateKey(date.getTime());
			const sessions = grouped.get(key);
			if (sessions) {
				sessions.push(session);
			} else {
				grouped.set(key, [session]);
			}
			date.setDate(date.getDate() + 1);
		}
	}
	for (const sessions of grouped.values()) {
		sessions.sort((left, right) => left.startedAt - right.startedAt);
	}
	return grouped;
}

export function sessionCalendarDays(
	month: Date,
	summaries: SavedSessionSummary[]
): SessionCalendarDay[] {
	const first = sessionCalendarMonth(month);
	const leadingDays = (first.getDay() + 6) % 7;
	const start = new Date(first.getFullYear(), first.getMonth(), 1 - leadingDays);
	const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
	const occupiedCells = leadingDays + last.getDate();
	const cellCount = Math.ceil(occupiedCells / 7) * 7;
	const grouped = sessionsByLocalDate(summaries);
	return Array.from({ length: cellCount }, (_, index) => {
		const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
		const key = localSessionDateKey(date.getTime());
		return {
			date,
			inCurrentMonth: date.getMonth() === first.getMonth(),
			key,
			sessions: grouped.get(key) ?? [],
		};
	});
}
