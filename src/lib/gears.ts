import { clamp } from './numbers';
import {
	DEFAULT_BIKE_WEIGHT_KG,
	DEFAULT_FRONT_CHAINRING_TEETH,
	DEFAULT_REAR_CASSETTE_TEETH,
	DEFAULT_RIDER_WEIGHT_KG,
	type VirtualDrivetrain,
} from './profile';
import { clampResistance } from './resistance';

export const VIRTUAL_FRONT_CHAINRING_TEETH = DEFAULT_FRONT_CHAINRING_TEETH;
export const VIRTUAL_REAR_CASSETTE_TEETH = DEFAULT_REAR_CASSETTE_TEETH;
export const DEFAULT_VIRTUAL_DRIVETRAIN: VirtualDrivetrain = {
	frontChainringTeeth: VIRTUAL_FRONT_CHAINRING_TEETH,
	rearCassetteTeeth: VIRTUAL_REAR_CASSETTE_TEETH,
};

export interface VirtualGearCombination {
	cassetteTeeth: number;
	chainringTeeth: number;
	ratio: number;
}

export function virtualGearCombinations(
	drivetrain: VirtualDrivetrain = DEFAULT_VIRTUAL_DRIVETRAIN
): VirtualGearCombination[] {
	return drivetrain.frontChainringTeeth
		.flatMap((chainringTeeth) =>
			drivetrain.rearCassetteTeeth.map((cassetteTeeth) => ({
				cassetteTeeth,
				chainringTeeth,
				ratio: chainringTeeth / cassetteTeeth,
			}))
		)
		.sort((left, right) => left.ratio - right.ratio);
}

export const VIRTUAL_GEAR_COMBINATIONS = Object.freeze(
	virtualGearCombinations(DEFAULT_VIRTUAL_DRIVETRAIN)
);

export const MIN_GEAR = 1;
export const MAX_GEAR = VIRTUAL_GEAR_COMBINATIONS.length;
export const DEFAULT_GEAR = 12;
export const GEAR_STORAGE_KEY = 'trainer-virtual-gear';
export const SHIFTING_CONNECTION_MESSAGE = 'Connect the trainer before shifting gears.';
export const MINIMUM_VIRTUAL_DRIVE_RATIO = Math.min(
	...VIRTUAL_GEAR_COMBINATIONS.map(({ ratio }) => ratio)
);
export const MAXIMUM_VIRTUAL_DRIVE_RATIO = Math.max(
	...VIRTUAL_GEAR_COMBINATIONS.map(({ ratio }) => ratio)
);

const RESISTANCE_PRECISION = 10;
const VIRTUAL_GEAR_LOAD_EXPONENT = 2;
const DEFAULT_TOTAL_MASS_KG = DEFAULT_RIDER_WEIGHT_KG + DEFAULT_BIKE_WEIGHT_KG;

export function maximumGear(drivetrain: VirtualDrivetrain = DEFAULT_VIRTUAL_DRIVETRAIN): number {
	return Math.max(
		MIN_GEAR,
		drivetrain.frontChainringTeeth.length * drivetrain.rearCassetteTeeth.length
	);
}

export function clampGear(gear: number, maximum = MAX_GEAR): number {
	return clamp(Math.round(gear), MIN_GEAR, Math.max(MIN_GEAR, maximum));
}

export function storedGear(
	storage: Pick<Storage, 'getItem'> = localStorage,
	fallback = DEFAULT_GEAR,
	maximum = MAX_GEAR
): number {
	const saved = Number(storage.getItem(GEAR_STORAGE_KEY));
	return Number.isFinite(saved) && saved > 0
		? clampGear(saved, maximum)
		: clampGear(fallback, maximum);
}

export function shiftedGear(current: number, change: number, maximum = MAX_GEAR): number {
	return clampGear(current + change, maximum);
}

export function virtualGearRatio(
	gear: number,
	drivetrain: VirtualDrivetrain = DEFAULT_VIRTUAL_DRIVETRAIN
): number {
	const combinations = virtualGearCombinations(drivetrain);
	return gearRatioFromCombinations(gear, combinations);
}

function gearRatioFromCombinations(
	gear: number,
	combinations: readonly VirtualGearCombination[]
): number {
	return (
		combinations.at(clampGear(gear, combinations.length) - MIN_GEAR)?.ratio ??
		combinations.at(0)?.ratio ??
		MINIMUM_VIRTUAL_DRIVE_RATIO
	);
}

function roundedResistance(resistance: number): number {
	return Math.round(clampResistance(resistance) * RESISTANCE_PRECISION) / RESISTANCE_PRECISION;
}

export function virtualGearLoadMultiplier(
	gear: number,
	drivetrain: VirtualDrivetrain = DEFAULT_VIRTUAL_DRIVETRAIN
): number {
	return gearLoadMultiplierFromCombinations(gear, virtualGearCombinations(drivetrain));
}

function gearLoadMultiplierFromCombinations(
	gear: number,
	combinations: readonly VirtualGearCombination[]
): number {
	const neutralGear = Math.ceil(combinations.length / 2);
	const relativeRatio =
		gearRatioFromCombinations(gear, combinations) /
		gearRatioFromCombinations(neutralGear, combinations);
	return relativeRatio ** VIRTUAL_GEAR_LOAD_EXPONENT;
}

export function systemMassLoadMultiplier(totalMassKg = DEFAULT_TOTAL_MASS_KG): number {
	return clamp(totalMassKg / DEFAULT_TOTAL_MASS_KG, 0.25, 5);
}

export function resistanceForVirtualGear(
	terrainResistance: number,
	gear: number,
	drivetrain: VirtualDrivetrain = DEFAULT_VIRTUAL_DRIVETRAIN,
	totalMassKg = DEFAULT_TOTAL_MASS_KG
): number {
	return roundedResistance(
		clampResistance(terrainResistance) *
			virtualGearLoadMultiplier(gear, drivetrain) *
			systemMassLoadMultiplier(totalMassKg)
	);
}

export function resistanceAfterGearShift(
	resistance: number,
	fromGear: number,
	toGear: number,
	drivetrain: VirtualDrivetrain = DEFAULT_VIRTUAL_DRIVETRAIN
): number {
	const combinations = virtualGearCombinations(drivetrain);
	return roundedResistance(
		resistance *
			(gearLoadMultiplierFromCombinations(toGear, combinations) /
				gearLoadMultiplierFromCombinations(fromGear, combinations))
	);
}
