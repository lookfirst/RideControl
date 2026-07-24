import { z } from 'zod';
import type { SpeedUnit } from '../types';
import {
	drivetrainGearCount,
	formattedTeeth,
	kilogramsForPounds,
	MAXIMUM_BIKE_WEIGHT_KG,
	MAXIMUM_DRIVETRAIN_TEETH,
	MAXIMUM_PROFILE_IDENTITY_LENGTH,
	MAXIMUM_PROFILE_NAME_LENGTH,
	MAXIMUM_RIDER_WEIGHT_KG,
	MAXIMUM_VIRTUAL_GEARS,
	MINIMUM_BIKE_WEIGHT_KG,
	MINIMUM_DRIVETRAIN_TEETH,
	MINIMUM_RIDER_WEIGHT_KG,
	PROFILE_IMAGE_TYPES,
	parsedTeeth,
	poundsForKilograms,
	type RiderProfile,
} from './profile';
import { MAXIMUM_PROFILE_IMAGE_SOURCE_BYTES } from './profile-image';
import { SPEED_UNIT_OPTIONS } from './units';

const speedUnitSchema = z.custom<SpeedUnit>(
	(value) => SPEED_UNIT_OPTIONS.some((option) => option.value === value),
	'Choose a valid display unit.'
);

export const profileImageSchema = z
	.custom<Blob>(
		(value) => value instanceof Blob && PROFILE_IMAGE_TYPES.some((type) => type === value.type),
		'Choose a JPEG, PNG, or WebP profile image.'
	)
	.refine(
		(image) => image.size <= MAXIMUM_PROFILE_IMAGE_SOURCE_BYTES,
		'Choose a profile image smaller than 32 MB.'
	)
	.optional();

export const profileFormSchema = z
	.object({
		bikeWeight: z.string(),
		frontChainrings: z.string(),
		identity: z
			.string()
			.max(
				MAXIMUM_PROFILE_IDENTITY_LENGTH,
				`Identity must be at most ${MAXIMUM_PROFILE_IDENTITY_LENGTH} characters.`
			),
		image: profileImageSchema,
		name: z
			.string()
			.max(
				MAXIMUM_PROFILE_NAME_LENGTH,
				`Name must be at most ${MAXIMUM_PROFILE_NAME_LENGTH} characters.`
			),
		rearCassette: z.string(),
		riderWeight: z.string(),
		speedUnit: speedUnitSchema,
	})
	.superRefine((values, context) => {
		const riderWeightKg = storedProfileWeight(values.riderWeight, values.speedUnit);
		const bikeWeightKg = storedProfileWeight(values.bikeWeight, values.speedUnit);
		const riderRange = profileWeightRange(
			values.speedUnit,
			MINIMUM_RIDER_WEIGHT_KG,
			MAXIMUM_RIDER_WEIGHT_KG
		);
		const bikeRange = profileWeightRange(
			values.speedUnit,
			MINIMUM_BIKE_WEIGHT_KG,
			MAXIMUM_BIKE_WEIGHT_KG
		);
		const unit = profileWeightUnit(values.speedUnit);

		if (
			!Number.isFinite(riderWeightKg) ||
			riderWeightKg < MINIMUM_RIDER_WEIGHT_KG ||
			riderWeightKg > MAXIMUM_RIDER_WEIGHT_KG
		) {
			context.addIssue({
				code: 'custom',
				message: `Enter a rider weight between ${riderRange.minimum.toFixed(0)} and ${riderRange.maximum.toFixed(0)} ${unit}.`,
				path: ['riderWeight'],
			});
		}
		if (
			!Number.isFinite(bikeWeightKg) ||
			bikeWeightKg < MINIMUM_BIKE_WEIGHT_KG ||
			bikeWeightKg > MAXIMUM_BIKE_WEIGHT_KG
		) {
			context.addIssue({
				code: 'custom',
				message: `Enter a bike weight between ${bikeRange.minimum.toFixed(0)} and ${bikeRange.maximum.toFixed(0)} ${unit}.`,
				path: ['bikeWeight'],
			});
		}

		const parsedFront = parsedTeeth(values.frontChainrings);
		const parsedRear = parsedTeeth(values.rearCassette);
		const drivetrainMessage = `Enter unique whole-number drivetrain teeth between ${MINIMUM_DRIVETRAIN_TEETH} and ${MAXIMUM_DRIVETRAIN_TEETH}, separated by slashes.`;

		if (!(parsedFront && validDrivetrainTeeth(parsedFront))) {
			context.addIssue({
				code: 'custom',
				message: drivetrainMessage,
				path: ['frontChainrings'],
			});
		} else if (parsedFront.length > 3) {
			context.addIssue({
				code: 'custom',
				message: 'Enter no more than three front chainrings.',
				path: ['frontChainrings'],
			});
		}
		if (!(parsedRear && validDrivetrainTeeth(parsedRear))) {
			context.addIssue({
				code: 'custom',
				message: drivetrainMessage,
				path: ['rearCassette'],
			});
		}
		if (parsedFront && parsedRear) {
			const gearCount = drivetrainGearCount({
				frontChainringTeeth: parsedFront,
				rearCassetteTeeth: parsedRear,
			});
			if (gearCount > MAXIMUM_VIRTUAL_GEARS) {
				context.addIssue({
					code: 'custom',
					message: `This drivetrain creates ${gearCount} gears. Ride Control supports up to ${MAXIMUM_VIRTUAL_GEARS}.`,
					path: ['rearCassette'],
				});
			}
		}
	});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function displayedProfileWeight(kilograms: number, speedUnit: SpeedUnit): string {
	const value = speedUnit === 'mph' ? poundsForKilograms(kilograms) : kilograms;
	return value.toFixed(1);
}

export function storedProfileWeight(value: string, speedUnit: SpeedUnit): number {
	const numericValue = Number(value);
	return speedUnit === 'mph' ? kilogramsForPounds(numericValue) : numericValue;
}

export function profileWeightRange(
	speedUnit: SpeedUnit,
	minimumKilograms: number,
	maximumKilograms: number
): { maximum: number; minimum: number } {
	if (speedUnit === 'kmh') {
		return { maximum: maximumKilograms, minimum: minimumKilograms };
	}
	return {
		maximum: Number(poundsForKilograms(maximumKilograms).toFixed(1)),
		minimum: Number(poundsForKilograms(minimumKilograms).toFixed(1)),
	};
}

export function profileWeightUnit(speedUnit: SpeedUnit): 'kg' | 'lb' {
	return speedUnit === 'mph' ? 'lb' : 'kg';
}

export function profileFormValues(profile: RiderProfile, speedUnit: SpeedUnit): ProfileFormValues {
	return {
		bikeWeight: displayedProfileWeight(profile.bikeWeightKg, speedUnit),
		frontChainrings: formattedTeeth(profile.frontChainringTeeth),
		identity: profile.identity,
		image: profile.image,
		name: profile.name,
		rearCassette: formattedTeeth(profile.rearCassetteTeeth),
		riderWeight: displayedProfileWeight(profile.riderWeightKg, speedUnit),
		speedUnit,
	};
}

export function profileFormValuesForSpeedUnit(
	values: ProfileFormValues,
	speedUnit: SpeedUnit
): ProfileFormValues {
	if (values.speedUnit === speedUnit) {
		return values;
	}
	const riderWeightKg = storedProfileWeight(values.riderWeight, values.speedUnit);
	const bikeWeightKg = storedProfileWeight(values.bikeWeight, values.speedUnit);
	return {
		...values,
		bikeWeight: Number.isFinite(bikeWeightKg)
			? displayedProfileWeight(bikeWeightKg, speedUnit)
			: values.bikeWeight,
		riderWeight: Number.isFinite(riderWeightKg)
			? displayedProfileWeight(riderWeightKg, speedUnit)
			: values.riderWeight,
		speedUnit,
	};
}

export function riderProfileFromFormValues(values: ProfileFormValues): RiderProfile {
	const validated = profileFormSchema.parse(values);
	const frontChainringTeeth = parsedTeeth(validated.frontChainrings);
	const rearCassetteTeeth = parsedTeeth(validated.rearCassette);
	if (!(frontChainringTeeth && rearCassetteTeeth)) {
		throw new Error('The validated drivetrain could not be parsed.');
	}
	return {
		bikeWeightKg: storedProfileWeight(validated.bikeWeight, validated.speedUnit),
		frontChainringTeeth,
		identity: validated.identity.trim(),
		image: validated.image,
		name: validated.name.trim(),
		rearCassetteTeeth,
		riderWeightKg: storedProfileWeight(validated.riderWeight, validated.speedUnit),
	};
}

function validDrivetrainTeeth(teeth: readonly number[]): boolean {
	return (
		teeth.every(
			(tooth) => tooth >= MINIMUM_DRIVETRAIN_TEETH && tooth <= MAXIMUM_DRIVETRAIN_TEETH
		) && new Set(teeth).size === teeth.length
	);
}
