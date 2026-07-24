import { useForm, useSelector } from '@tanstack/react-form';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
	useBodyScrollLock,
	useCloseOnEscape,
	useDialogInitialFocus,
} from '../hooks/use-dialog-behavior';
import { errorMessage } from '../lib/errors';
import {
	drivetrainGearCount,
	MAXIMUM_BIKE_WEIGHT_KG,
	MAXIMUM_PROFILE_IDENTITY_LENGTH,
	MAXIMUM_PROFILE_NAME_LENGTH,
	MAXIMUM_RIDER_WEIGHT_KG,
	MINIMUM_BIKE_WEIGHT_KG,
	MINIMUM_RIDER_WEIGHT_KG,
	PROFILE_IDENTITY_SUGGESTIONS,
	PROFILE_IMAGE_ACCEPT,
	parsedTeeth,
	type RiderProfile,
} from '../lib/profile';
import {
	profileFormSchema,
	profileFormValues,
	profileFormValuesForSpeedUnit,
	profileImageSchema,
	profileWeightRange,
	profileWeightUnit,
	riderProfileFromFormValues,
} from '../lib/profile-form';
import { prepareProfileImage } from '../lib/profile-image';
import { SPEED_UNIT_OPTIONS } from '../lib/units';
import { requestUnloadConfirmation } from '../lib/unload';
import type { SpeedUnit } from '../types';
import { FormFieldError } from './form-field-error';

const fieldClass =
	'mt-2 w-full rounded-xl border border-line bg-[#10151a] px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-mint';
const labelClass = 'block font-semibold text-slate-200 text-sm';
const helpClass = 'mt-1.5 text-slate-500 text-xs leading-5';

function profileInitial(name: string): string {
	return name.trim().charAt(0).toLocaleUpperCase() || 'R';
}

function profileSaveButtonLabel(imagePreparing: boolean, isSubmitting: boolean): string {
	if (imagePreparing) {
		return 'Preparing image…';
	}
	return isSubmitting ? 'Saving…' : 'Save profile';
}

export function ProfileDialog({
	onClose,
	onSave,
	onSelectSpeedUnit,
	open,
	physicsSettingsLocked,
	profile,
	speedUnit,
	storageError,
}: {
	onClose: () => void;
	onSave: (profile: RiderProfile) => Promise<void>;
	onSelectSpeedUnit: (unit: SpeedUnit) => void;
	open: boolean;
	physicsSettingsLocked: boolean;
	profile: RiderProfile;
	speedUnit: SpeedUnit;
	storageError: string;
}) {
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	useCloseOnEscape(open, onClose);
	useBodyScrollLock(open);
	const [saveError, setSaveError] = useState('');
	const [imageError, setImageError] = useState('');
	const [imagePreparing, setImagePreparing] = useState(false);
	const imagePreparationGeneration = useRef(0);
	const form = useForm({
		defaultValues: profileFormValues(profile, speedUnit),
		onSubmit: async ({ formApi, value }) => {
			setSaveError('');
			try {
				const nextProfile = riderProfileFromFormValues(value);
				const image = nextProfile.image
					? await prepareProfileImage(nextProfile.image)
					: undefined;
				await onSave({ ...nextProfile, image });
				onSelectSpeedUnit(value.speedUnit);
				formApi.reset({ ...value, image });
				onClose();
			} catch {
				setSaveError('Your profile could not be saved in this browser. Please try again.');
			}
		},
		validators: {
			onChange: profileFormSchema,
			onSubmit: profileFormSchema,
		},
	});
	const values = useSelector(form.store, (state) => state.values);
	const canSubmit = useSelector(form.store, (state) => state.canSubmit);
	const isDirty = useSelector(form.store, (state) => state.isDirty);
	const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
	const imageUrl = useMemo(
		() => (values.image ? URL.createObjectURL(values.image) : undefined),
		[values.image]
	);
	const weightUnit = profileWeightUnit(values.speedUnit);
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
	const parsedFront = parsedTeeth(values.frontChainrings);
	const parsedRear = parsedTeeth(values.rearCassette);
	const gearCount =
		parsedFront && parsedRear
			? drivetrainGearCount({
					frontChainringTeeth: parsedFront,
					rearCassetteTeeth: parsedRear,
				})
			: 0;

	useEffect(() => {
		if (!open) {
			imagePreparationGeneration.current += 1;
			setImagePreparing(false);
			return;
		}
		imagePreparationGeneration.current += 1;
		form.reset(profileFormValues(profile, speedUnit));
		setImageError('');
		setImagePreparing(false);
		setSaveError('');
	}, [form, open, profile, speedUnit]);

	useEffect(
		() => () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl);
			}
		},
		[imageUrl]
	);

	useEffect(() => {
		if (!(open && (imagePreparing || isDirty))) {
			return;
		}
		const confirmUnsavedProfileExit = (event: BeforeUnloadEvent) => {
			requestUnloadConfirmation(event);
		};
		window.addEventListener('beforeunload', confirmUnsavedProfileExit);
		return () => window.removeEventListener('beforeunload', confirmUnsavedProfileExit);
	}, [imagePreparing, isDirty, open]);

	if (!open) {
		return null;
	}

	const selectSpeedUnit = (unit: SpeedUnit) => {
		if (unit === values.speedUnit) {
			return;
		}
		const converted = profileFormValuesForSpeedUnit(values, unit);
		form.setFieldValue('bikeWeight', converted.bikeWeight);
		form.setFieldValue('riderWeight', converted.riderWeight);
		form.setFieldValue('speedUnit', unit);
	};

	const selectProfileImage = async (
		file: File,
		onPrepared: (image: Blob | undefined) => void
	) => {
		const result = profileImageSchema.safeParse(file);
		if (!result.success) {
			setImageError(result.error.issues[0]?.message ?? 'Choose a valid profile image.');
			return;
		}
		if (!result.data) {
			setImageError('Choose a valid profile image.');
			return;
		}
		const generation = imagePreparationGeneration.current + 1;
		imagePreparationGeneration.current = generation;
		setImagePreparing(true);
		setImageError('');
		setSaveError('');
		try {
			const image = await prepareProfileImage(result.data);
			if (imagePreparationGeneration.current === generation) {
				onPrepared(image);
			}
		} catch (preparationError) {
			if (imagePreparationGeneration.current === generation) {
				setImageError(errorMessage(preparationError));
			}
		} finally {
			if (imagePreparationGeneration.current === generation) {
				setImagePreparing(false);
			}
		}
	};

	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/65 p-3 backdrop-blur-sm sm:p-4">
			<section
				aria-labelledby="profile-title"
				aria-modal="true"
				className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-panel shadow-2xl shadow-black/50 sm:max-h-[calc(100dvh-2rem)]"
				role="dialog"
			>
				<header className="flex shrink-0 items-start justify-between gap-4 border-line border-b px-5 py-4 sm:px-6">
					<h2 className="font-bold text-2xl" id="profile-title">
						Profile
					</h2>
					<button
						aria-label="Close profile"
						className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						ref={closeButtonRef}
						type="button"
					>
						×
					</button>
				</header>
				<form
					className="overflow-y-auto px-5 py-5 sm:px-6"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
				>
					<form.Field name="image">
						{(field) => (
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
								<div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-slate-800 font-bold text-3xl text-mint">
									{imageUrl ? (
										<img
											alt={
												values.name.trim()
													? `${values.name.trim()}'s profile`
													: 'Profile'
											}
											className="h-full w-full object-cover"
											height="96"
											src={imageUrl}
											width="96"
										/>
									) : (
										<span aria-hidden="true">
											{profileInitial(values.name)}
										</span>
									)}
								</div>
								<div>
									<label
										aria-disabled={imagePreparing}
										className={`inline-flex rounded-lg border border-line bg-slate-800 px-3 py-2 font-semibold text-slate-200 text-sm transition ${imagePreparing ? 'cursor-wait opacity-60' : 'cursor-pointer hover:border-mint'}`}
										htmlFor="profile-image"
									>
										{imagePreparing
											? 'Preparing image…'
											: 'Choose profile image'}
									</label>
									<input
										accept={PROFILE_IMAGE_ACCEPT}
										className="sr-only"
										disabled={imagePreparing}
										id="profile-image"
										onChange={(event) => {
											const [file] = Array.from(event.target.files ?? []);
											if (file) {
												selectProfileImage(file, (image) =>
													field.handleChange(image)
												);
											}
											event.target.value = '';
										}}
										type="file"
									/>
									{field.state.value ? (
										<button
											className="ml-3 rounded-sm font-semibold text-rose-300 text-sm hover:text-rose-200"
											onClick={() => field.handleChange(undefined)}
											type="button"
										>
											Remove
										</button>
									) : null}
									<p className={helpClass}>
										JPEG, PNG, or WebP. Resized and compressed in this browser
										before storage.
									</p>
									{imageError ? (
										<p className="mt-1 text-rose-300 text-xs" role="alert">
											{imageError}
										</p>
									) : null}
									<FormFieldError field={field} />
								</div>
							</div>
						)}
					</form.Field>

					<div className="mt-6 grid gap-5 sm:grid-cols-2">
						<form.Field name="name">
							{(field) => (
								<label className={labelClass} htmlFor="profile-name">
									Name
									<input
										className={fieldClass}
										id="profile-name"
										maxLength={MAXIMUM_PROFILE_NAME_LENGTH}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										placeholder="Your name"
										value={field.state.value}
									/>
									<FormFieldError field={field} />
								</label>
							)}
						</form.Field>
						<form.Field name="identity">
							{(field) => (
								<label className={labelClass} htmlFor="profile-identity">
									Sex or gender identity{' '}
									<span className="font-normal text-slate-500">(optional)</span>
									<input
										className={fieldClass}
										id="profile-identity"
										list="profile-identity-suggestions"
										maxLength={MAXIMUM_PROFILE_IDENTITY_LENGTH}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										placeholder="Choose or describe your own"
										value={field.state.value}
									/>
									<datalist id="profile-identity-suggestions">
										{PROFILE_IDENTITY_SUGGESTIONS.map((suggestion) => (
											<option key={suggestion} value={suggestion} />
										))}
									</datalist>
									<span className={helpClass}>
										Optional and never used in workout calculations.
									</span>
									<FormFieldError field={field} />
								</label>
							)}
						</form.Field>
						<fieldset className="sm:col-span-2">
							<legend className={labelClass}>Display units</legend>
							<div className="mt-2 inline-flex h-10 rounded-lg border border-line bg-[#10151a] p-1">
								{SPEED_UNIT_OPTIONS.map((option) => (
									<button
										aria-pressed={values.speedUnit === option.value}
										className={`rounded px-3 py-1 font-bold text-xs ${values.speedUnit === option.value ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
										key={option.value}
										onClick={() => selectSpeedUnit(option.value)}
										type="button"
									>
										{option.label}
									</button>
								))}
							</div>
							<p className={helpClass}>
								Controls speed, distance, elevation, and weight units.
							</p>
						</fieldset>
						<form.Field name="riderWeight">
							{(field) => (
								<label className={labelClass} htmlFor="profile-rider-weight">
									Your weight ({weightUnit})
									<input
										className={fieldClass}
										disabled={physicsSettingsLocked}
										id="profile-rider-weight"
										inputMode="decimal"
										max={riderRange.maximum}
										min={riderRange.minimum}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										step="0.1"
										type="number"
										value={field.state.value}
									/>
									<FormFieldError field={field} />
								</label>
							)}
						</form.Field>
						<form.Field name="bikeWeight">
							{(field) => (
								<label className={labelClass} htmlFor="profile-bike-weight">
									Bike weight ({weightUnit})
									<input
										className={fieldClass}
										disabled={physicsSettingsLocked}
										id="profile-bike-weight"
										inputMode="decimal"
										max={bikeRange.maximum}
										min={bikeRange.minimum}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										step="0.1"
										type="number"
										value={field.state.value}
									/>
									<FormFieldError field={field} />
								</label>
							)}
						</form.Field>
						<form.Field name="frontChainrings">
							{(field) => (
								<label className={labelClass} htmlFor="profile-front-chainrings">
									Front chainrings
									<input
										className={fieldClass}
										disabled={physicsSettingsLocked}
										id="profile-front-chainrings"
										inputMode="numeric"
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										placeholder="53/39"
										value={field.state.value}
									/>
									<span className={helpClass}>
										Teeth separated by slashes, such as 53/39.
									</span>
									<FormFieldError field={field} />
								</label>
							)}
						</form.Field>
						<form.Field name="rearCassette">
							{(field) => (
								<label className={labelClass} htmlFor="profile-rear-cassette">
									Rear cassette
									<input
										className={fieldClass}
										disabled={physicsSettingsLocked}
										id="profile-rear-cassette"
										inputMode="numeric"
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										placeholder="12/13/14/15/16/17/18/19/20/21/22/24"
										value={field.state.value}
									/>
									<span className={helpClass}>
										Teeth separated by slashes. This setup creates{' '}
										{gearCount || '—'} virtual gears.
									</span>
									<FormFieldError field={field} />
								</label>
							)}
						</form.Field>
					</div>

					{physicsSettingsLocked ? (
						<p className="mt-5 text-amber-200 text-sm leading-6">
							Weight and drivetrain settings are locked after a ride starts so its
							recorded profile remains accurate. End the session to edit them for your
							next ride.
						</p>
					) : null}
					<p className="mt-5 rounded-xl border border-line bg-[#10151a] px-4 py-3 text-slate-400 text-sm leading-6">
						Rider and bike weight adjust terrain load. Chainring and cassette sizes
						define the virtual gear ratios. Your profile stays in IndexedDB on this
						device.
					</p>
					{saveError || storageError ? (
						<p className="mt-4 text-rose-300 text-sm" role="alert">
							{saveError || storageError}
						</p>
					) : null}
					<div className="mt-5 flex justify-end gap-2">
						<button
							className="rounded-lg px-4 py-2.5 font-semibold text-slate-400 text-sm hover:bg-slate-800 hover:text-slate-200"
							disabled={isSubmitting}
							onClick={onClose}
							type="button"
						>
							Cancel
						</button>
						<button
							className="rounded-lg border border-mint/50 bg-mint/15 px-4 py-2.5 font-bold text-mint text-sm hover:bg-mint/20 disabled:opacity-50"
							disabled={imagePreparing || isSubmitting || !canSubmit}
							type="submit"
						>
							{profileSaveButtonLabel(imagePreparing, isSubmitting)}
						</button>
					</div>
				</form>
			</section>
		</div>
	);
}
