import type { SpeedUnit } from '../types';

export const MILLISECONDS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const METERS_PER_KILOMETER = 1000;
export const METERS_PER_FOOT = 0.3048;
export const KILOMETERS_PER_MILE = 1.609_344;
export const KILOMETERS_PER_HOUR_PER_METER_PER_SECOND = 3.6;
export const SPEED_UNIT_STORAGE_KEY = 'speed-unit';
const DESCRIPTION_DISTANCE_SUFFIX = /(?:—|-)\s*\d+(?:[.,]\d+)?\s*(?:km|mi)\s*$/iu;

export const SPEED_UNIT_OPTIONS: { label: string; value: SpeedUnit }[] = [
	{ label: 'KM/H', value: 'kmh' },
	{ label: 'MPH', value: 'mph' },
];

export function storedSpeedUnit(storage: Pick<Storage, 'getItem'> = localStorage): SpeedUnit {
	return storage.getItem(SPEED_UNIT_STORAGE_KEY) === 'kmh' ? 'kmh' : 'mph';
}

export function distanceUnitLabel(unit: SpeedUnit): 'km' | 'mi' {
	return unit === 'mph' ? 'mi' : 'km';
}

export function speedUnitLabel(unit: SpeedUnit): 'km/h' | 'mph' {
	return unit === 'mph' ? 'mph' : 'km/h';
}

export function elevationUnitLabel(unit: SpeedUnit): 'ft' | 'm' {
	return unit === 'mph' ? 'ft' : 'm';
}

export function minimumSpeedChartMaximum(unit: SpeedUnit): number {
	return unit === 'mph' ? 20 : 30;
}

export function convertDistance(kilometers: number, unit: SpeedUnit): number {
	return unit === 'mph' ? kilometers / KILOMETERS_PER_MILE : kilometers;
}

export function convertSpeed(kilometersPerHour: number, unit: SpeedUnit): number {
	return unit === 'mph' ? kilometersPerHour / KILOMETERS_PER_MILE : kilometersPerHour;
}

export function convertElevation(meters: number, unit: SpeedUnit): number {
	return unit === 'mph' ? meters / METERS_PER_FOOT : meters;
}

export function formatDistanceValue(kilometers: number, unit: SpeedUnit, decimals = 2): string {
	return convertDistance(kilometers, unit).toFixed(decimals);
}

export function formatDistance(kilometers: number, unit: SpeedUnit, decimals = 2): string {
	return `${formatDistanceValue(kilometers, unit, decimals)} ${distanceUnitLabel(unit)}`;
}

export function formatDescriptionDistance(
	description: string,
	kilometers: number,
	unit: SpeedUnit
): string {
	return description.replace(
		DESCRIPTION_DISTANCE_SUFFIX,
		`— ${formatDistance(kilometers, unit, 0)}`
	);
}

export function descriptionWithoutDistance(description: string): string {
	return description.replace(DESCRIPTION_DISTANCE_SUFFIX, '').trim();
}

export function formatDistanceProgress(
	currentKilometers: number,
	totalKilometers: number,
	unit: SpeedUnit
): string {
	const current = formatDistanceValue(currentKilometers, unit, 2);
	const total = formatDistanceValue(totalKilometers, unit, 2);
	return `${current} / ${total} ${distanceUnitLabel(unit)}`;
}

export function formatElevation(meters: number, unit: SpeedUnit, decimals = 0): string {
	return `${convertElevation(meters, unit).toFixed(decimals)} ${elevationUnitLabel(unit)}`;
}

export function formatSpeed(kilometersPerHour: number, unit: SpeedUnit, decimals = 1): string {
	return convertSpeed(kilometersPerHour, unit).toFixed(decimals);
}

export function averageSpeed(distanceKilometers: number, elapsedSeconds: number): number {
	return elapsedSeconds > 0 ? distanceKilometers / (elapsedSeconds / SECONDS_PER_HOUR) : 0;
}

export function kilometersTraveled(kilometersPerHour: number, seconds: number): number {
	return (kilometersPerHour * seconds) / SECONDS_PER_HOUR;
}

export function metersForKilometers(kilometers: number): number {
	return kilometers * METERS_PER_KILOMETER;
}

export function kilometersForMeters(meters: number): number {
	return meters / METERS_PER_KILOMETER;
}

export function metersPerSecond(kilometersPerHour: number): number {
	return kilometersPerHour / KILOMETERS_PER_HOUR_PER_METER_PER_SECOND;
}

export function millisecondsForSeconds(seconds: number): number {
	return seconds * MILLISECONDS_PER_SECOND;
}

export function secondsForMilliseconds(milliseconds: number): number {
	return milliseconds / MILLISECONDS_PER_SECOND;
}
