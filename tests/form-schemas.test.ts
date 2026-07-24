import { describe, expect, test } from 'bun:test';
import { FormApi } from '@tanstack/react-form';
import { formErrorMessage } from '../src/lib/form-errors';
import { DEFAULT_RIDER_PROFILE } from '../src/lib/profile';
import {
	profileFormSchema,
	profileFormValues,
	profileFormValuesForSpeedUnit,
	riderProfileFromFormValues,
} from '../src/lib/profile-form';
import { renameWorkoutFormSchema } from '../src/lib/rename-workout-form';
import {
	MAXIMUM_SESSION_COMMENTS_LENGTH,
	sessionMetadataFromFormValues,
	sessionSaveFormSchema,
} from '../src/lib/session-save-form';
import { welcomeFormSchema } from '../src/lib/welcome-form';

describe('dialog form schemas', () => {
	test('round trips the default profile through validated form values', () => {
		const values = profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh');
		expect(profileFormSchema.safeParse(values).success).toBeTrue();
		expect(riderProfileFromFormValues(values)).toEqual(DEFAULT_RIDER_PROFILE);
	});

	test('preserves profile weights when display units change', () => {
		const metric = profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh');
		const imperial = profileFormValuesForSpeedUnit(metric, 'mph');
		const metricAgain = profileFormValuesForSpeedUnit(imperial, 'kmh');
		expect(imperial.speedUnit).toBe('mph');
		expect(imperial.riderWeight).toBe('165.3');
		expect(metricAgain.riderWeight).toBe(metric.riderWeight);
		expect(metricAgain.bikeWeight).toBe(metric.bikeWeight);
	});

	test('tracks unsaved profile edits and clears them after reset', () => {
		const defaults = profileFormValues(DEFAULT_RIDER_PROFILE, 'mph');
		const form = new FormApi({
			defaultValues: defaults,
			validators: {
				onChange: profileFormSchema,
				onSubmit: profileFormSchema,
			},
		});
		const unmount = form.mount();
		expect(form.state.isDirty).toBeFalse();
		form.setFieldValue('name', 'Riley');
		expect(form.state.isDirty).toBeTrue();
		form.reset(defaults);
		expect(form.state.isDirty).toBeFalse();
		unmount();
	});

	test('normalizes validated profile text and drivetrain values', () => {
		const values = {
			...profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh'),
			frontChainrings: '50 / 34',
			identity: ' Non-binary ',
			name: ' Riley ',
			rearCassette: '11,13,15,17',
		};
		expect(riderProfileFromFormValues(values)).toEqual({
			...DEFAULT_RIDER_PROFILE,
			frontChainringTeeth: [50, 34],
			identity: 'Non-binary',
			image: undefined,
			name: 'Riley',
			rearCassetteTeeth: [11, 13, 15, 17],
		});
	});

	test('reports profile weight and drivetrain errors on their fields', () => {
		const values = {
			...profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh'),
			frontChainrings: '53/53',
			rearCassette: '1/2/3',
			riderWeight: '0',
		};
		const result = profileFormSchema.safeParse(values);
		expect(result.success).toBeFalse();
		if (result.success) {
			return;
		}
		expect(result.error.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: ['riderWeight'] }),
				expect.objectContaining({ path: ['frontChainrings'] }),
				expect.objectContaining({ path: ['rearCassette'] }),
			])
		);
	});

	test('rejects too many chainrings and virtual gears', () => {
		const result = profileFormSchema.safeParse({
			...profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh'),
			frontChainrings: '56/50/44/38',
			rearCassette: '11/12/13/14/15/16/17',
		});
		expect(result.success).toBeFalse();
		if (result.success) {
			return;
		}
		expect(result.error.issues.map((issue) => issue.message)).toEqual(
			expect.arrayContaining([
				'Enter no more than three front chainrings.',
				'This drivetrain creates 28 gears. Ride Control supports up to 24.',
			])
		);
	});

	test('accepts supported profile images and rejects other blobs', () => {
		const values = profileFormValues(DEFAULT_RIDER_PROFILE, 'mph');
		expect(
			profileFormSchema.safeParse({
				...values,
				image: new Blob(['image'], { type: 'image/webp' }),
			}).success
		).toBeTrue();
		expect(
			profileFormSchema.safeParse({
				...values,
				image: new Blob(['document'], { type: 'application/pdf' }),
			}).success
		).toBeFalse();
	});

	test('validates and trims renamed workout names', () => {
		expect(renameWorkoutFormSchema.parse({ name: '  Morning ride  ' })).toEqual({
			name: 'Morning ride',
		});
		expect(renameWorkoutFormSchema.safeParse({ name: '   ' }).success).toBeFalse();
	});

	test('validates session metadata and trims comments', () => {
		expect(
			sessionMetadataFromFormValues({
				comments: '  Felt strong  ',
				feeling: 'great',
			})
		).toEqual({ comments: 'Felt strong', feeling: 'great' });
		expect(
			sessionSaveFormSchema.safeParse({
				comments: 'x'.repeat(MAXIMUM_SESSION_COMMENTS_LENGTH + 1),
				feeling: 'great',
			}).success
		).toBeFalse();
		expect(
			sessionSaveFormSchema.safeParse({
				comments: '',
				feeling: 'unrecognized',
			}).success
		).toBeFalse();
	});

	test('extracts readable TanStack field errors from Zod issues', () => {
		expect(formErrorMessage({ message: 'Enter a valid weight.' })).toBe(
			'Enter a valid weight.'
		);
		expect(formErrorMessage('Required')).toBe('Required');
		expect(formErrorMessage({})).toBe('Enter a valid value.');
	});

	test('accepts only a boolean welcome preference', () => {
		expect(welcomeFormSchema.safeParse({ dontShowAgain: true }).success).toBeTrue();
		expect(welcomeFormSchema.safeParse({ dontShowAgain: 'true' }).success).toBeFalse();
	});
});
