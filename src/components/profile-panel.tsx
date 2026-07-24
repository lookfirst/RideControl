import { useForm, useSelector } from '@tanstack/react-form';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { APP_OVERLAY } from '../lib/app-overlay';
import { errorMessage, unreachable } from '../lib/errors';
import {
	drivetrainGearCount,
	MAXIMUM_BIKE_COLOR_LENGTH,
	MAXIMUM_BIKE_MANUFACTURER_LENGTH,
	MAXIMUM_BIKE_MODEL_LENGTH,
	MAXIMUM_BIKE_NAME_LENGTH,
	MAXIMUM_BIKE_WEIGHT_KG,
	MAXIMUM_PROFILE_BIKES,
	MAXIMUM_PROFILE_IDENTITY_LENGTH,
	MAXIMUM_PROFILE_NAME_LENGTH,
	MAXIMUM_RIDER_WEIGHT_KG,
	MINIMUM_BIKE_WEIGHT_KG,
	MINIMUM_RIDER_WEIGHT_KG,
	PROFILE_IDENTITY_SUGGESTIONS,
	PROFILE_IMAGE_ACCEPT,
	parsedTeeth,
	type RiderProfile,
	type RiderWeightEntry,
} from '../lib/profile';
import {
	bikeImageSchema,
	newProfileBikeFormValues,
	profileFormSchema,
	profileFormValues,
	profileFormValuesForSpeedUnit,
	profileImageSchema,
	profileWeightRange,
	profileWeightUnit,
	riderProfileFromFormValues,
} from '../lib/profile-form';
import { prepareProfileImage } from '../lib/profile-image';
import { PROFILE_TAB, PROFILE_TAB_OPTIONS, type ProfileTab } from '../lib/profile-tab';
import { SPEED_UNIT_OPTIONS } from '../lib/units';
import { requestUnloadConfirmation } from '../lib/unload';
import type { SpeedUnit } from '../types';
import { FormFieldError } from './form-field-error';
import { Icon } from './icon';
import { RiderWeightChart } from './rider-weight-chart';
import { SideTray } from './side-tray';
import { Tabs } from './tabs';

const fieldClass =
	'mt-2 w-full rounded-xl border border-line bg-[#10151a] px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-mint';
const labelClass = 'block font-semibold text-slate-200 text-sm';
const helpClass = 'mt-1.5 text-slate-500 text-xs leading-5';
const IMAGE_REMOVAL_KIND = {
	BIKE: 'bike',
	PROFILE: 'profile',
} as const;

type PendingImageRemoval =
	| { kind: typeof IMAGE_REMOVAL_KIND.PROFILE }
	| {
			bikeId: string;
			bikeName: string;
			kind: typeof IMAGE_REMOVAL_KIND.BIKE;
	  };

function profileInitial(name: string): string {
	return name.trim().charAt(0).toLocaleUpperCase() || 'R';
}

function profileSaveButtonLabel(imagePreparing: boolean, isSubmitting: boolean): string {
	if (imagePreparing) {
		return 'Preparing image…';
	}
	return isSubmitting ? 'Saving…' : 'Save profile';
}

function bikeGearCount(frontChainrings: string, rearCassette: string): number {
	const front = parsedTeeth(frontChainrings);
	const rear = parsedTeeth(rearCassette);
	return front && rear
		? drivetrainGearCount({
				frontChainringTeeth: front,
				rearCassetteTeeth: rear,
			})
		: 0;
}

function ImageActions({
	chooseLabel,
	disabled,
	hasImage,
	inputId,
	onRemove,
	preparing,
	removeDialogId,
}: {
	chooseLabel: string;
	disabled: boolean;
	hasImage: boolean;
	inputId: string;
	onRemove: () => void;
	preparing: boolean;
	removeDialogId: string;
}) {
	const visibleChooseLabel = hasImage ? 'Change image' : chooseLabel;
	return (
		<div className="inline-flex overflow-hidden rounded-lg border border-line bg-slate-800 shadow-sm">
			<label
				aria-disabled={disabled}
				className={`inline-flex items-center gap-2 px-3 py-2 font-semibold text-slate-200 text-sm transition ${
					disabled ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-slate-700'
				}`}
				htmlFor={inputId}
			>
				<Icon className="h-4 w-4 text-slate-400" name="upload" />
				{preparing ? <span>Preparing image…</span> : <span>{visibleChooseLabel}</span>}
			</label>
			{hasImage ? (
				<button
					aria-controls={removeDialogId}
					aria-haspopup="dialog"
					className="inline-flex items-center gap-2 border-line border-l px-3 py-2 font-semibold text-rose-300 text-sm transition hover:bg-rose-400/10 hover:text-rose-200 disabled:cursor-wait disabled:opacity-50"
					disabled={disabled}
					onClick={onRemove}
					type="button"
				>
					<Icon className="h-4 w-4" name="trash" />
					Remove
				</button>
			) : null}
		</div>
	);
}

function RiderWeightHistory({
	entries,
	speedUnit,
}: {
	entries: readonly RiderWeightEntry[];
	speedUnit: SpeedUnit;
}) {
	return (
		<section className="mt-5" data-weight-history="true">
			<h3 className="font-bold text-slate-200">Weight history</h3>
			{entries.length > 0 ? (
				<RiderWeightChart compact entries={entries} speedUnit={speedUnit} />
			) : (
				<p className="mt-2 rounded-xl border border-line bg-[#10151a] p-4 text-slate-400 text-sm">
					Your first saved weight will start the history.
				</p>
			)}
		</section>
	);
}

function ProfileGuidance({
	physicsSettingsLocked,
	profileTab,
}: {
	physicsSettingsLocked: boolean;
	profileTab: ProfileTab;
}) {
	if (profileTab === PROFILE_TAB.BIKES && !physicsSettingsLocked) {
		return null;
	}

	return (
		<p
			className="mt-5 rounded-xl border border-line bg-[#10151a] px-4 py-3 text-slate-400 text-sm leading-6"
			data-profile-guidance={profileTab}
		>
			{profileTab === PROFILE_TAB.PERSONAL ? (
				<>
					Your profile stays on device.
					{physicsSettingsLocked
						? ' Rider weight is locked while a ride is active so its recorded profile remains accurate. End the session to change it for your next ride.'
						: ''}
					{' In the future we will offer cloud storage and sync, as a premium feature.'}
				</>
			) : (
				<>
					The active bike, bike weight, and drivetrain are locked while a ride is active
					so its recorded profile remains accurate. End the session to change them for
					your next ride.
				</>
			)}
		</p>
	);
}

export function RemoveBikeDialog({
	bikeName,
	onCancel,
	onConfirm,
	open,
}: {
	bikeName: string;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}) {
	const confirmButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	useCloseOnEscape(open, onCancel);

	if (!open) {
		return null;
	}

	return (
		<div className="absolute inset-0 z-30 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<button
				aria-label="Cancel bike removal"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onCancel}
				type="button"
			/>
			<section
				aria-describedby="remove-bike-description"
				aria-labelledby="remove-bike-title"
				aria-modal="true"
				className="relative z-10 w-full max-w-sm rounded-2xl border border-rose-400/40 bg-panel p-5 shadow-2xl shadow-black/60"
				id="remove-bike-dialog"
				role="alertdialog"
			>
				<h2 className="font-bold text-lg" id="remove-bike-title">
					Remove this bike?
				</h2>
				<p className="mt-2 text-slate-400 text-sm leading-6" id="remove-bike-description">
					<span className="font-semibold text-slate-200">{bikeName || 'This bike'}</span>{' '}
					will be removed from your profile when you save your changes.
				</p>
				<div className="mt-5 flex justify-end gap-2">
					<button
						className="rounded-lg px-3 py-2 font-semibold text-slate-400 text-sm hover:bg-slate-800 hover:text-white"
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="rounded-lg bg-rose-400 px-3 py-2 font-bold text-ink text-sm hover:bg-rose-300"
						onClick={onConfirm}
						ref={confirmButtonRef}
						type="button"
					>
						Remove bike
					</button>
				</div>
			</section>
		</div>
	);
}

export function RemoveImageDialog({
	bikeName = '',
	kind,
	onCancel,
	onConfirm,
	open,
}: {
	bikeName?: string;
	kind: PendingImageRemoval['kind'];
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}) {
	const confirmButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	useCloseOnEscape(open, onCancel);

	if (!open) {
		return null;
	}

	const isProfileImage = kind === IMAGE_REMOVAL_KIND.PROFILE;
	const title = isProfileImage ? 'Remove profile image?' : 'Remove bike image?';
	const description = isProfileImage ? (
		'Your profile image will be removed when you save your changes.'
	) : (
		<>
			The image for{' '}
			<span className="font-semibold text-slate-200">{bikeName || 'this bike'}</span> will be
			removed when you save your changes.
		</>
	);

	return (
		<div className="absolute inset-0 z-30 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<button
				aria-label="Cancel image removal"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onCancel}
				type="button"
			/>
			<section
				aria-describedby="remove-image-description"
				aria-labelledby="remove-image-title"
				aria-modal="true"
				className="relative z-10 w-full max-w-sm rounded-2xl border border-rose-400/40 bg-panel p-5 shadow-2xl shadow-black/60"
				id="remove-image-dialog"
				role="alertdialog"
			>
				<h2 className="font-bold text-lg" id="remove-image-title">
					{title}
				</h2>
				<p className="mt-2 text-slate-400 text-sm leading-6" id="remove-image-description">
					{description}
				</p>
				<div className="mt-5 flex justify-end gap-2">
					<button
						className="rounded-lg px-3 py-2 font-semibold text-slate-400 text-sm hover:bg-slate-800 hover:text-white"
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="inline-flex items-center gap-2 rounded-lg bg-rose-400 px-3 py-2 font-bold text-ink text-sm hover:bg-rose-300"
						onClick={onConfirm}
						ref={confirmButtonRef}
						type="button"
					>
						<Icon className="h-4 w-4" name="trash" />
						Remove image
					</button>
				</div>
			</section>
		</div>
	);
}

export function ProfilePanel({
	onClose,
	onSave,
	onSelectSpeedUnit,
	onSelectTab,
	open,
	physicsSettingsLocked,
	profile,
	requestedTab,
	speedUnit,
	storageError,
}: {
	onClose: () => void;
	onSave: (profile: RiderProfile) => Promise<void>;
	onSelectSpeedUnit: (unit: SpeedUnit) => void;
	onSelectTab: (tab: ProfileTab) => void;
	open: boolean;
	physicsSettingsLocked: boolean;
	profile: RiderProfile;
	requestedTab?: ProfileTab;
	speedUnit: SpeedUnit;
	storageError: string;
}) {
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	const [saveError, setSaveError] = useState('');
	const [imageError, setImageError] = useState('');
	const [imagePreparing, setImagePreparing] = useState(false);
	const [bikeImageError, setBikeImageError] = useState('');
	const [bikeImagePreparingId, setBikeImagePreparingId] = useState<string>();
	const [bikePendingRemoval, setBikePendingRemoval] = useState<{
		id: string;
		name: string;
	}>();
	const [imagePendingRemoval, setImagePendingRemoval] = useState<PendingImageRemoval>();
	const imagePreparationGeneration = useRef(0);
	const bikeImagePreparationGeneration = useRef(0);
	const form = useForm({
		defaultValues: profileFormValues(profile, speedUnit),
		onSubmit: async ({ formApi, value }) => {
			setSaveError('');
			try {
				const nextProfile = riderProfileFromFormValues(value, profile);
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
	const activeBikeIndex = values.bikes.findIndex((bike) => bike.id === values.activeBikeId);
	const activeBike = values.bikes.at(activeBikeIndex);
	const bikeImageUrl = useMemo(
		() => (activeBike?.image ? URL.createObjectURL(activeBike.image) : undefined),
		[activeBike?.image]
	);
	const bikeImagePreparing = bikeImagePreparingId === activeBike?.id;
	const imagePreparationInProgress = imagePreparing || Boolean(bikeImagePreparingId);
	const profileTab = requestedTab ?? PROFILE_TAB.PERSONAL;
	const gearCount = activeBike
		? bikeGearCount(activeBike.frontChainrings, activeBike.rearCassette)
		: 0;
	const frontChainringCount = activeBike ? parsedTeeth(activeBike.frontChainrings)?.length : 0;
	const rearGearCount = activeBike ? parsedTeeth(activeBike.rearCassette)?.length : 0;
	const drivetrainLabel =
		frontChainringCount && rearGearCount
			? `${frontChainringCount}×${rearGearCount}`
			: undefined;

	useEffect(() => {
		if (!open) {
			imagePreparationGeneration.current += 1;
			bikeImagePreparationGeneration.current += 1;
			setImagePreparing(false);
			setBikeImagePreparingId(undefined);
			return;
		}
		imagePreparationGeneration.current += 1;
		bikeImagePreparationGeneration.current += 1;
		form.reset(profileFormValues(profile, speedUnit));
		setBikePendingRemoval(undefined);
		setImagePendingRemoval(undefined);
		setBikeImageError('');
		setBikeImagePreparingId(undefined);
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

	useEffect(
		() => () => {
			if (bikeImageUrl) {
				URL.revokeObjectURL(bikeImageUrl);
			}
		},
		[bikeImageUrl]
	);

	useEffect(() => {
		if (!(open && (imagePreparing || bikeImagePreparingId || isDirty))) {
			return;
		}
		const confirmUnsavedProfileExit = (event: BeforeUnloadEvent) => {
			requestUnloadConfirmation(event);
		};
		window.addEventListener('beforeunload', confirmUnsavedProfileExit);
		return () => window.removeEventListener('beforeunload', confirmUnsavedProfileExit);
	}, [bikeImagePreparingId, imagePreparing, isDirty, open]);

	const selectSpeedUnit = (unit: SpeedUnit) => {
		if (unit === values.speedUnit) {
			return;
		}
		const converted = profileFormValuesForSpeedUnit(values, unit);
		form.setFieldValue('bikes', converted.bikes);
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

	const selectBikeImage = async (
		file: File,
		bikeId: string,
		onPrepared: (image: Blob | undefined) => void
	) => {
		const result = bikeImageSchema.safeParse(file);
		if (!result.success) {
			setBikeImageError(result.error.issues[0]?.message ?? 'Choose a valid bike image.');
			return;
		}
		if (!result.data) {
			setBikeImageError('Choose a valid bike image.');
			return;
		}
		const generation = bikeImagePreparationGeneration.current + 1;
		bikeImagePreparationGeneration.current = generation;
		setBikeImagePreparingId(bikeId);
		setBikeImageError('');
		setSaveError('');
		try {
			const image = await prepareProfileImage(result.data);
			if (bikeImagePreparationGeneration.current === generation) {
				onPrepared(image);
			}
		} catch (preparationError) {
			if (bikeImagePreparationGeneration.current === generation) {
				setBikeImageError(errorMessage(preparationError));
			}
		} finally {
			if (bikeImagePreparationGeneration.current === generation) {
				setBikeImagePreparingId(undefined);
			}
		}
	};

	const addBike = () => {
		if (
			physicsSettingsLocked ||
			bikeImagePreparingId ||
			values.bikes.length >= MAXIMUM_PROFILE_BIKES
		) {
			return;
		}
		const id = crypto.randomUUID();
		form.pushFieldValue(
			'bikes',
			newProfileBikeFormValues(id, `Bike ${values.bikes.length + 1}`, values.speedUnit)
		);
		form.setFieldValue('activeBikeId', id);
	};

	const removePendingBike = () => {
		const bikeIndex = values.bikes.findIndex((bike) => bike.id === bikePendingRemoval?.id);
		if (
			physicsSettingsLocked ||
			bikeImagePreparingId ||
			bikeIndex < 0 ||
			values.bikes.length <= 1
		) {
			setBikePendingRemoval(undefined);
			return;
		}
		const replacement = values.bikes.at(bikeIndex - 1) ?? values.bikes.at(bikeIndex + 1);
		if (!replacement) {
			setBikePendingRemoval(undefined);
			return;
		}
		form.setFieldValue('activeBikeId', replacement.id);
		form.removeFieldValue('bikes', bikeIndex);
		setBikePendingRemoval(undefined);
	};

	const removePendingImage = () => {
		if (!imagePendingRemoval) {
			return;
		}
		switch (imagePendingRemoval.kind) {
			case IMAGE_REMOVAL_KIND.PROFILE:
				form.setFieldValue('image', undefined);
				break;
			case IMAGE_REMOVAL_KIND.BIKE: {
				const bikeIndex = values.bikes.findIndex(
					(bike) => bike.id === imagePendingRemoval.bikeId
				);
				if (bikeIndex >= 0) {
					form.setFieldValue(`bikes[${bikeIndex}].image`, undefined);
				}
				break;
			}
			default:
				unreachable(imagePendingRemoval);
		}
		setImagePendingRemoval(undefined);
	};

	const closeNestedConfirmation = () => {
		if (imagePendingRemoval) {
			setImagePendingRemoval(undefined);
			return true;
		}
		if (bikePendingRemoval) {
			setBikePendingRemoval(undefined);
			return true;
		}
		return false;
	};

	return (
		<SideTray
			closeLabel="Close profile"
			closeOnEscape={!(bikePendingRemoval || imagePendingRemoval)}
			labelledBy="profile-title"
			onClose={() => {
				if (closeNestedConfirmation()) {
					return;
				}
				onClose();
			}}
			open={open}
			panelClassName="flex max-w-3xl flex-col overflow-hidden sm:w-[min(48rem,calc(100vw-2rem))]"
			tray={APP_OVERLAY.PROFILE}
		>
			<header className="flex shrink-0 items-center justify-between gap-4 border-line border-b px-5 py-3 sm:px-6">
				<div className="flex min-w-0 items-baseline gap-3">
					<h2 className="shrink-0 font-bold text-xl" id="profile-title">
						Profile
					</h2>
					<p className="truncate text-slate-400 text-sm">
						Manage your rider details and bikes.
					</p>
				</div>
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
				className="flex min-h-0 flex-1 flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					form.handleSubmit();
				}}
			>
				<Tabs
					ariaLabel="Profile sections"
					idPrefix="profile"
					onChange={onSelectTab}
					options={PROFILE_TAB_OPTIONS}
					value={profileTab}
				/>
				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
					<section
						aria-labelledby="profile-tab-personal"
						hidden={profileTab !== PROFILE_TAB.PERSONAL}
						id="profile-panel-personal"
						role="tabpanel"
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
										<ImageActions
											chooseLabel="Choose profile image"
											disabled={imagePreparing}
											hasImage={Boolean(field.state.value)}
											inputId="profile-image"
											onRemove={() =>
												setImagePendingRemoval({
													kind: IMAGE_REMOVAL_KIND.PROFILE,
												})
											}
											preparing={imagePreparing}
											removeDialogId="remove-image-dialog"
										/>
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
										{imageError ? (
											<p className="mt-2 text-rose-300 text-xs" role="alert">
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
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
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
										<span className="font-normal text-slate-500">
											(optional)
										</span>
										<input
											className={fieldClass}
											id="profile-identity"
											list="profile-identity-suggestions"
											maxLength={MAXIMUM_PROFILE_IDENTITY_LENGTH}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="Choose or describe your own"
											value={field.state.value}
										/>
										<datalist id="profile-identity-suggestions">
											{PROFILE_IDENTITY_SUGGESTIONS.map((suggestion) => (
												<option key={suggestion} value={suggestion} />
											))}
										</datalist>
										<FormFieldError field={field} />
									</label>
								)}
							</form.Field>
							<fieldset>
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
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											step="0.1"
											type="number"
											value={field.state.value}
										/>
										<FormFieldError field={field} />
									</label>
								)}
							</form.Field>
						</div>
						<RiderWeightHistory
							entries={profile.weightHistory}
							speedUnit={values.speedUnit}
						/>
					</section>

					<section
						aria-labelledby="profile-tab-bikes"
						hidden={profileTab !== PROFILE_TAB.BIKES}
						id="profile-panel-bikes"
						role="tabpanel"
					>
						<div className="flex items-start justify-between gap-4">
							<div>
								<h3 className="font-bold text-lg">Bikes</h3>
								<p className="mt-1 text-slate-500 text-xs leading-5">
									The active bike supplies weight and gearing to trainer physics.
								</p>
							</div>
							<button
								className="rounded-lg border border-line px-3 py-2 font-semibold text-slate-300 text-xs hover:border-mint hover:text-white disabled:opacity-40"
								disabled={
									physicsSettingsLocked ||
									Boolean(bikeImagePreparingId) ||
									values.bikes.length >= MAXIMUM_PROFILE_BIKES
								}
								onClick={addBike}
								type="button"
							>
								Add bike
							</button>
						</div>

						<form.Field name="activeBikeId">
							{(field) => (
								<div className="mt-4 grid gap-2 sm:grid-cols-2">
									{values.bikes.map((bike) => {
										const selected = field.state.value === bike.id;
										const count = bikeGearCount(
											bike.frontChainrings,
											bike.rearCassette
										);
										return (
											<button
												aria-pressed={selected}
												className={`rounded-xl border p-3 text-left transition ${
													selected
														? 'border-mint/60 bg-mint/10'
														: 'border-line bg-[#12171d] hover:border-slate-500'
												}`}
												disabled={
													physicsSettingsLocked ||
													Boolean(bikeImagePreparingId)
												}
												key={bike.id}
												onClick={() => {
													setBikeImageError('');
													field.handleChange(bike.id);
												}}
												type="button"
											>
												<span className="flex items-center justify-between gap-3">
													<span className="truncate font-bold text-sm">
														{bike.name || 'Unnamed bike'}
													</span>
													{selected ? (
														<span className="shrink-0 font-bold text-[10px] text-mint uppercase tracking-[.12em]">
															Active
														</span>
													) : null}
												</span>
												<span className="mt-1 block text-slate-500 text-xs">
													{bike.bikeWeight} {weightUnit} · {count || '—'}{' '}
													gears
												</span>
											</button>
										);
									})}
									<FormFieldError field={field} />
								</div>
							)}
						</form.Field>

						{activeBike && activeBikeIndex >= 0 ? (
							<div className="mt-5 rounded-2xl border border-line bg-[#12171d] p-4 sm:p-5">
								<div className="flex items-center justify-between gap-4">
									<h4 className="font-bold">Active bike settings</h4>
									<button
										aria-controls="remove-bike-dialog"
										aria-haspopup="dialog"
										className="font-semibold text-rose-300 text-xs hover:text-rose-200 disabled:opacity-40"
										disabled={
											physicsSettingsLocked ||
											Boolean(bikeImagePreparingId) ||
											values.bikes.length <= 1
										}
										onClick={() =>
											setBikePendingRemoval({
												id: activeBike.id,
												name: activeBike.name,
											})
										}
										type="button"
									>
										Remove bike
									</button>
								</div>
								<form.Field name={`bikes[${activeBikeIndex}].image`}>
									{(field) => (
										<div className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-[#10151a] p-3 sm:flex-row sm:items-center">
											<div className="grid aspect-3/2 w-full shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-slate-900 text-slate-600 text-xs uppercase tracking-[.16em] sm:w-40">
												{bikeImageUrl ? (
													<img
														alt={`${activeBike.name || 'Bike'} profile`}
														className="h-full w-full object-cover"
														height="107"
														src={bikeImageUrl}
														width="160"
													/>
												) : (
													<span aria-hidden="true">Bike image</span>
												)}
											</div>
											<div className="min-w-0">
												<ImageActions
													chooseLabel="Choose bike image"
													disabled={Boolean(bikeImagePreparingId)}
													hasImage={Boolean(field.state.value)}
													inputId="profile-bike-image"
													onRemove={() =>
														setImagePendingRemoval({
															bikeId: activeBike.id,
															bikeName: activeBike.name,
															kind: IMAGE_REMOVAL_KIND.BIKE,
														})
													}
													preparing={bikeImagePreparing}
													removeDialogId="remove-image-dialog"
												/>
												<input
													accept={PROFILE_IMAGE_ACCEPT}
													className="sr-only"
													disabled={Boolean(bikeImagePreparingId)}
													id="profile-bike-image"
													onChange={(event) => {
														const [file] = Array.from(
															event.target.files ?? []
														);
														if (file) {
															selectBikeImage(
																file,
																activeBike.id,
																(image) => field.handleChange(image)
															);
														}
														event.target.value = '';
													}}
													type="file"
												/>
												{bikeImageError ? (
													<p
														className="mt-2 text-rose-300 text-xs"
														role="alert"
													>
														{bikeImageError}
													</p>
												) : null}
												<FormFieldError field={field} />
											</div>
										</div>
									)}
								</form.Field>
								<div className="mt-4 grid gap-5 sm:grid-cols-2">
									<form.Field name={`bikes[${activeBikeIndex}].name`}>
										{(field) => (
											<label
												className={labelClass}
												htmlFor="profile-bike-name"
											>
												Bike name
												<input
													className={fieldClass}
													id="profile-bike-name"
													maxLength={MAXIMUM_BIKE_NAME_LENGTH}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="Bike name"
													value={field.state.value}
												/>
												<FormFieldError field={field} />
											</label>
										)}
									</form.Field>
									<form.Field name={`bikes[${activeBikeIndex}].manufacturer`}>
										{(field) => (
											<label
												className={labelClass}
												htmlFor="profile-bike-manufacturer"
											>
												Manufacturer
												<input
													className={fieldClass}
													id="profile-bike-manufacturer"
													maxLength={MAXIMUM_BIKE_MANUFACTURER_LENGTH}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="Specialized"
													value={field.state.value}
												/>
												<FormFieldError field={field} />
											</label>
										)}
									</form.Field>
									<form.Field name={`bikes[${activeBikeIndex}].model`}>
										{(field) => (
											<label
												className={labelClass}
												htmlFor="profile-bike-model"
											>
												Model
												<input
													className={fieldClass}
													id="profile-bike-model"
													maxLength={MAXIMUM_BIKE_MODEL_LENGTH}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="Tarmac SL8"
													value={field.state.value}
												/>
												<FormFieldError field={field} />
											</label>
										)}
									</form.Field>
									<form.Field name={`bikes[${activeBikeIndex}].color`}>
										{(field) => (
											<label
												className={labelClass}
												htmlFor="profile-bike-color"
											>
												Color
												<input
													className={fieldClass}
													id="profile-bike-color"
													maxLength={MAXIMUM_BIKE_COLOR_LENGTH}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="Satin black"
													value={field.state.value}
												/>
												<FormFieldError field={field} />
											</label>
										)}
									</form.Field>
									<form.Field name={`bikes[${activeBikeIndex}].purchasedOn`}>
										{(field) => (
											<label
												className={labelClass}
												htmlFor="profile-bike-purchased-on"
											>
												Purchase date
												<input
													className={fieldClass}
													id="profile-bike-purchased-on"
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													type="date"
													value={field.state.value}
												/>
												<FormFieldError field={field} />
											</label>
										)}
									</form.Field>
									<form.Field name={`bikes[${activeBikeIndex}].bikeWeight`}>
										{(field) => (
											<label
												className={labelClass}
												htmlFor="profile-bike-weight"
											>
												Bike weight ({weightUnit})
												<input
													className={fieldClass}
													disabled={physicsSettingsLocked}
													id="profile-bike-weight"
													inputMode="decimal"
													max={bikeRange.maximum}
													min={bikeRange.minimum}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													step="0.1"
													type="number"
													value={field.state.value}
												/>
												<FormFieldError field={field} />
											</label>
										)}
									</form.Field>
									<form.Field name={`bikes[${activeBikeIndex}].frontChainrings`}>
										{(field) => (
											<label
												className={labelClass}
												htmlFor="profile-front-chainrings"
											>
												Front chainrings
												<input
													className={fieldClass}
													disabled={physicsSettingsLocked}
													id="profile-front-chainrings"
													inputMode="numeric"
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="53/39"
													value={field.state.value}
												/>
												<span className={helpClass}>
													Use one value for a 1× setup, such as 42, or
													separate multiple chainrings with slashes.
												</span>
												<FormFieldError field={field} />
											</label>
										)}
									</form.Field>
									<form.Field name={`bikes[${activeBikeIndex}].rearCassette`}>
										{(field) => (
											<label
												className={labelClass}
												htmlFor="profile-rear-cassette"
											>
												Rear cassette
												<input
													className={fieldClass}
													disabled={physicsSettingsLocked}
													id="profile-rear-cassette"
													inputMode="numeric"
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="12/13/14/15/16/17/18/19/20/21/22/24"
													value={field.state.value}
												/>
												<span className={helpClass}>
													List every rear sprocket, including an 11- or
													12-speed cassette. This{' '}
													{drivetrainLabel ? `${drivetrainLabel} ` : ''}
													setup creates {gearCount || '—'} virtual gears.
												</span>
												<FormFieldError field={field} />
											</label>
										)}
									</form.Field>
								</div>
							</div>
						) : null}
					</section>

					<ProfileGuidance
						physicsSettingsLocked={physicsSettingsLocked}
						profileTab={profileTab}
					/>
					{saveError || storageError ? (
						<p className="mt-4 text-rose-300 text-sm" role="alert">
							{saveError || storageError}
						</p>
					) : null}
				</div>
				<footer className="flex shrink-0 justify-end gap-2 border-line border-t px-5 py-4 sm:px-6">
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
						disabled={imagePreparationInProgress || isSubmitting || !canSubmit}
						type="submit"
					>
						{profileSaveButtonLabel(imagePreparationInProgress, isSubmitting)}
					</button>
				</footer>
			</form>
			<RemoveBikeDialog
				bikeName={bikePendingRemoval?.name ?? ''}
				onCancel={() => setBikePendingRemoval(undefined)}
				onConfirm={removePendingBike}
				open={Boolean(bikePendingRemoval)}
			/>
			<RemoveImageDialog
				bikeName={
					imagePendingRemoval?.kind === IMAGE_REMOVAL_KIND.BIKE
						? imagePendingRemoval.bikeName
						: undefined
				}
				kind={imagePendingRemoval?.kind ?? IMAGE_REMOVAL_KIND.PROFILE}
				onCancel={() => setImagePendingRemoval(undefined)}
				onConfirm={removePendingImage}
				open={Boolean(imagePendingRemoval)}
			/>
		</SideTray>
	);
}
