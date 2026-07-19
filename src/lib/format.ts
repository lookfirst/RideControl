import type { MetricAggregate } from '../types';
import { nonNegativeNumber } from './numbers';
import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from './units';

export function formatDuration(totalSeconds: number) {
	const seconds = Math.floor(totalSeconds);
	const hours = Math.floor(seconds / SECONDS_PER_HOUR);
	const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
	return [hours, minutes, seconds % SECONDS_PER_MINUTE]
		.map((value) => String(value).padStart(2, '0'))
		.join(':');
}

export function formatChartSeconds(totalSeconds: number) {
	const seconds = Math.max(0, Math.round(totalSeconds));
	const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
	return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}

export function formatAggregateAverage(aggregate: MetricAggregate, decimals: number) {
	return aggregateAverage(aggregate).toFixed(decimals);
}

export function aggregateAverage(aggregate: MetricAggregate): number {
	return aggregate.count > 0 ? aggregate.sum / aggregate.count : 0;
}

export function aggregateMaximum(aggregate: MetricAggregate): number {
	return nonNegativeNumber(aggregate.maximum);
}

export function formatWholeNumber(value: number): string {
	return String(Math.round(value));
}

export function formatGrade(grade: number): string {
	const rounded = Number(grade.toFixed(1));
	return rounded === 0 ? '0%' : `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}
