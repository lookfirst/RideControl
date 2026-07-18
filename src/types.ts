export interface Metrics {
	cadence: number;
	calories: number;
	distance: number;
	heartRate: number;
	power: number;
	speed: number;
}

export interface RoutePoint {
	distance: number;
	elevation: number;
}

export interface Range {
	max: number;
	min: number;
}

export interface MetricSample {
	cadence: number;
	elapsedSeconds: number;
	heartRate: number;
	power: number;
	speed: number;
}

export interface MetricAggregate {
	count: number;
	sum: number;
}

export interface SessionAggregates {
	cadence: MetricAggregate;
	heartRate: MetricAggregate;
	power: MetricAggregate;
}

export interface StoredSession {
	aggregates: SessionAggregates;
	calories: number;
	distance: number;
	elapsedSeconds: number;
	ended: boolean;
	history: MetricSample[];
	maximums: Metrics;
	savedSessionId?: string;
	startedAt: number;
}

export type SessionFeeling = 'great' | 'good' | 'okay' | 'tough' | 'exhausted';

export interface SessionMetadata {
	comments: string;
	feeling?: SessionFeeling;
}

export interface SessionSnapshot {
	aggregates: SessionAggregates;
	calories: number;
	distance: number;
	elapsedSeconds: number;
	history: MetricSample[];
	maximums: Metrics;
	startedAt: number;
}

export interface SavedSession extends SessionSnapshot, SessionMetadata {
	endedAt: number;
	id: string;
}

export interface SavedSessionSummary {
	calories: number;
	distance: number;
	elapsedSeconds: number;
	endedAt: number;
	feeling?: SessionFeeling;
	id: string;
	startedAt: number;
}

export type ChartMode = 'all' | 'cadence' | 'elevation' | 'heartRate' | 'power' | 'speed';

export type SpeedUnit = 'kmh' | 'mph';
