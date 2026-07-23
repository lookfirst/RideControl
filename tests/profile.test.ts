import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_BIKE_WEIGHT_KG,
	DEFAULT_FRONT_CHAINRING_TEETH,
	DEFAULT_REAR_CASSETTE_TEETH,
	DEFAULT_RIDER_PROFILE,
	DEFAULT_RIDER_WEIGHT_KG,
	drivetrainGearCount,
	formattedTeeth,
	kilogramsForPounds,
	parsedTeeth,
	poundsForKilograms,
	profileFromStoredValue,
	profileTotalMassKg,
} from '../src/lib/profile';

describe('rider profile', () => {
	test('provides a neutral local profile with the existing 2×12 drivetrain', () => {
		expect(DEFAULT_RIDER_PROFILE.name).toBe('');
		expect(DEFAULT_RIDER_PROFILE.identity).toBe('');
		expect(profileTotalMassKg(DEFAULT_RIDER_PROFILE)).toBe(
			DEFAULT_RIDER_WEIGHT_KG + DEFAULT_BIKE_WEIGHT_KG
		);
		expect(
			drivetrainGearCount({
				frontChainringTeeth: DEFAULT_FRONT_CHAINRING_TEETH,
				rearCassetteTeeth: DEFAULT_REAR_CASSETTE_TEETH,
			})
		).toBe(24);
	});

	test('parses familiar drivetrain notation', () => {
		expect(parsedTeeth('53/39')).toEqual([53, 39]);
		expect(parsedTeeth('12, 13 14/15')).toEqual([12, 13, 14, 15]);
		expect(parsedTeeth('53.5/39')).toBeUndefined();
		expect(parsedTeeth('')).toBeUndefined();
		expect(formattedTeeth([53, 39])).toBe('53/39');
	});

	test('round trips pounds and kilograms', () => {
		expect(kilogramsForPounds(poundsForKilograms(84))).toBeCloseTo(84, 10);
	});

	test('validates a versioned IndexedDB profile record', () => {
		const image = new Blob(['profile'], { type: 'image/png' });
		expect(
			profileFromStoredValue({
				bikeWeightKg: 8.5,
				frontChainringTeeth: [50, 34],
				identity: 'Non-binary',
				image,
				name: 'Riley',
				rearCassetteTeeth: [11, 13, 15, 17],
				riderWeightKg: 68,
				version: 1,
			})
		).toEqual({
			bikeWeightKg: 8.5,
			frontChainringTeeth: [50, 34],
			identity: 'Non-binary',
			image,
			name: 'Riley',
			rearCassetteTeeth: [11, 13, 15, 17],
			riderWeightKg: 68,
		});
		expect(
			profileFromStoredValue({
				bikeWeightKg: 8.5,
				frontChainringTeeth: [50, 34],
				identity: '',
				name: 'Riley',
				rearCassetteTeeth: Array.from({ length: 13 }, (_, index) => index + 10),
				riderWeightKg: 68,
				version: 1,
			})
		).toBeUndefined();
	});
});
