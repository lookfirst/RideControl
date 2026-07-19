import type { ControlMode } from './lib/control-mode';
import type { WorkoutDifficulty } from './lib/workout-schema';

export type { ChartMode } from './lib/chart-mode';
export type { ControlMode } from './lib/control-mode';

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

export interface GeographicRoutePoint extends RoutePoint {
	latitude: number;
	longitude: number;
}

export interface WorkoutRoutePoint extends GeographicRoutePoint {
	x: number;
	y: number;
}

export interface WorkoutCourse {
	baseResistance: number;
	description: string;
	difficulty: WorkoutDifficulty;
	distance: number;
	elevationGain: number;
	id: string;
	name: string;
	points: WorkoutRoutePoint[];
}

export interface SessionWorkout {
	course: WorkoutCourse;
}

export interface WorkoutTerrain {
	completedLaps: number;
	distance: number;
	elevation: number;
	grade: number;
	lap: number;
	progress: number;
	resistance: number;
	x: number;
	y: number;
}

export interface ElevationTotals {
	ascent: number;
	descent: number;
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
	elevation?: number;
	gear?: number;
	grade?: number;
	heartRate: number;
	power: number;
	resistance?: number;
	speed: number;
	workoutDistance?: number;
	workoutLap?: number;
}

export interface MetricAggregate {
	count: number;
	maximum?: number;
	sum: number;
}

export interface SessionAggregates {
	cadence: MetricAggregate;
	gear: MetricAggregate;
	heartRate: MetricAggregate;
	power: MetricAggregate;
	resistance: MetricAggregate;
}

export interface StoredSession {
	aggregates: SessionAggregates;
	calories: number;
	controlMode: ControlMode;
	discarded: boolean;
	distance: number;
	elapsedSeconds: number;
	elevationTotals: ElevationTotals;
	ended: boolean;
	endedAt: number;
	history: MetricSample[];
	maximums: Metrics;
	plannedWorkout?: SessionWorkout;
	savedSessionId?: string;
	startedAt: number;
	workout?: SessionWorkout;
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
	elevationTotals: ElevationTotals;
	endedAt: number;
	history: MetricSample[];
	maximums: Metrics;
	startedAt: number;
	workout?: SessionWorkout;
}

export interface SavedSession extends SessionSnapshot, SessionMetadata {
	id: string;
	importedAt?: number;
}

export interface SavedSessionSummary {
	calories: number;
	distance: number;
	elapsedSeconds: number;
	endedAt: number;
	feeling?: SessionFeeling;
	id: string;
	importedAt?: number;
	startedAt: number;
	workoutName?: string;
}

export type SpeedUnit = 'kmh' | 'mph';
