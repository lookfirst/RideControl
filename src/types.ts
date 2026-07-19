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

export type ResistanceRampPhase = 'holding' | 'queued' | 'ramping' | 'settled';
export type ResistanceAdjustmentDirection = 'decrease' | 'increase';

export interface ResistanceRamp {
	current: number;
	from: number;
	phase: ResistanceRampPhase;
	progress: number;
	to: number;
}

export interface MetricSample {
	cadence: number;
	elapsedSeconds: number;
	gear?: number;
	heartRate: number;
	power: number;
	resistance?: number;
	speed: number;
}

export interface MetricAggregate {
	count: number;
	sum: number;
}

export interface SessionAggregates {
	cadence: MetricAggregate;
	gear: MetricAggregate;
	heartRate: MetricAggregate;
	power: MetricAggregate;
	resistance: MetricAggregate;
}

export type ControlMode = 'gear' | 'resistance';

export interface StoredSession {
	aggregates: SessionAggregates;
	calories: number;
	controlMode: ControlMode;
	distance: number;
	elapsedSeconds: number;
	ended: boolean;
	endedAt: number;
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
	controlMode: ControlMode;
	distance: number;
	elapsedSeconds: number;
	endedAt: number;
	history: MetricSample[];
	maximums: Metrics;
	startedAt: number;
}

export interface SavedSession extends SessionSnapshot, SessionMetadata {
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

export type ChartMode =
	| 'all'
	| 'cadence'
	| 'elevation'
	| 'gear'
	| 'heartRate'
	| 'power'
	| 'resistance'
	| 'speed';

export type SpeedUnit = 'kmh' | 'mph';
