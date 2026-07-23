import { useEffect, useMemo, useState } from 'react';
import {
	useBodyScrollLock,
	useCloseOnEscape,
	useDialogInitialFocus,
} from '../hooks/use-dialog-behavior';
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
	PROFILE_IDENTITY_SUGGESTIONS,
	PROFILE_IMAGE_ACCEPT,
	PROFILE_IMAGE_TYPES,
	parsedTeeth,
	poundsForKilograms,
	type RiderProfile,
} from '../lib/profile';
import type { SpeedUnit } from '../types';

const fieldClass =
	'mt-2 w-full rounded-xl border border-line bg-[#10151a] px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-mint';
const labelClass = 'block font-semibold text-slate-200 text-sm';
const helpClass = 'mt-1.5 text-slate-500 text-xs leading-5';

function displayWeight(kilograms: number, speedUnit: SpeedUnit): string {
	const value = speedUnit === 'mph' ? poundsForKilograms(kilograms) : kilograms;
	return value.toFixed(1);
}

function storedWeight(value: string, speedUnit: SpeedUnit): number {
	const numericValue = Number(value);
	return speedUnit === 'mph' ? kilogramsForPounds(numericValue) : numericValue;
}

function weightRange(
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

function validTeeth(teeth: readonly number[]): boolean {
	return (
		teeth.every(
			(tooth) => tooth >= MINIMUM_DRIVETRAIN_TEETH && tooth <= MAXIMUM_DRIVETRAIN_TEETH
		) && new Set(teeth).size === teeth.length
	);
}

function profileInitial(name: string): string {
	return name.trim().charAt(0).toLocaleUpperCase() || 'R';
}

export function ProfileDialog({
	onClose,
	onSave,
	open,
	profile,
	speedUnit,
	storageError,
}: {
	onClose: () => void;
	onSave: (profile: RiderProfile) => Promise<void>;
	open: boolean;
	profile: RiderProfile;
	speedUnit: SpeedUnit;
	storageError: string;
}) {
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	useCloseOnEscape(open, onClose);
	useBodyScrollLock(open);
	const [name, setName] = useState(profile.name);
	const [identity, setIdentity] = useState(profile.identity);
	const [riderWeight, setRiderWeight] = useState(() =>
		displayWeight(profile.riderWeightKg, speedUnit)
	);
	const [bikeWeight, setBikeWeight] = useState(() =>
		displayWeight(profile.bikeWeightKg, speedUnit)
	);
	const [frontChainrings, setFrontChainrings] = useState(() =>
		formattedTeeth(profile.frontChainringTeeth)
	);
	const [rearCassette, setRearCassette] = useState(() =>
		formattedTeeth(profile.rearCassetteTeeth)
	);
	const [image, setImage] = useState<Blob | undefined>(profile.image);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const imageUrl = useMemo(() => (image ? URL.createObjectURL(image) : undefined), [image]);
	const weightUnit = speedUnit === 'mph' ? 'lb' : 'kg';
	const riderRange = weightRange(speedUnit, MINIMUM_RIDER_WEIGHT_KG, MAXIMUM_RIDER_WEIGHT_KG);
	const bikeRange = weightRange(speedUnit, MINIMUM_BIKE_WEIGHT_KG, MAXIMUM_BIKE_WEIGHT_KG);
	const parsedFront = parsedTeeth(frontChainrings);
	const parsedRear = parsedTeeth(rearCassette);
	const gearCount =
		parsedFront && parsedRear
			? drivetrainGearCount({
					frontChainringTeeth: parsedFront,
					rearCassetteTeeth: parsedRear,
				})
			: 0;

	useEffect(() => {
		if (!open) {
			return;
		}
		setName(profile.name);
		setIdentity(profile.identity);
		setRiderWeight(displayWeight(profile.riderWeightKg, speedUnit));
		setBikeWeight(displayWeight(profile.bikeWeightKg, speedUnit));
		setFrontChainrings(formattedTeeth(profile.frontChainringTeeth));
		setRearCassette(formattedTeeth(profile.rearCassetteTeeth));
		setImage(profile.image);
		setError('');
		setSaving(false);
	}, [open, profile, speedUnit]);

	useEffect(
		() => () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl);
			}
		},
		[imageUrl]
	);

	if (!open) {
		return null;
	}

	const submitProfile = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const riderWeightKg = storedWeight(riderWeight, speedUnit);
		const bikeWeightKg = storedWeight(bikeWeight, speedUnit);
		if (
			!Number.isFinite(riderWeightKg) ||
			riderWeightKg < MINIMUM_RIDER_WEIGHT_KG ||
			riderWeightKg > MAXIMUM_RIDER_WEIGHT_KG
		) {
			setError(
				`Enter a rider weight between ${riderRange.minimum.toFixed(0)} and ${riderRange.maximum.toFixed(0)} ${weightUnit}.`
			);
			return;
		}
		if (
			!Number.isFinite(bikeWeightKg) ||
			bikeWeightKg < MINIMUM_BIKE_WEIGHT_KG ||
			bikeWeightKg > MAXIMUM_BIKE_WEIGHT_KG
		) {
			setError(
				`Enter a bike weight between ${bikeRange.minimum.toFixed(0)} and ${bikeRange.maximum.toFixed(0)} ${weightUnit}.`
			);
			return;
		}
		if (!(parsedFront && parsedRear && validTeeth(parsedFront) && validTeeth(parsedRear))) {
			setError(
				`Enter unique whole-number drivetrain teeth between ${MINIMUM_DRIVETRAIN_TEETH} and ${MAXIMUM_DRIVETRAIN_TEETH}, separated by slashes.`
			);
			return;
		}
		if (parsedFront.length > 3) {
			setError('Enter no more than three front chainrings.');
			return;
		}
		if (gearCount > MAXIMUM_VIRTUAL_GEARS) {
			setError(
				`This drivetrain creates ${gearCount} gears. Ride Control supports up to ${MAXIMUM_VIRTUAL_GEARS}.`
			);
			return;
		}
		setSaving(true);
		setError('');
		try {
			await onSave({
				bikeWeightKg,
				frontChainringTeeth: parsedFront,
				identity: identity.trim(),
				image,
				name: name.trim(),
				rearCassetteTeeth: parsedRear,
				riderWeightKg,
			});
			onClose();
		} catch {
			setError('Your profile could not be saved in this browser. Please try again.');
			setSaving(false);
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
				<form className="overflow-y-auto px-5 py-5 sm:px-6" onSubmit={submitProfile}>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
						<div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-slate-800 font-bold text-3xl text-mint">
							{imageUrl ? (
								<img
									alt={name.trim() ? `${name.trim()}'s profile` : 'Profile'}
									className="h-full w-full object-cover"
									height="96"
									src={imageUrl}
									width="96"
								/>
							) : (
								<span aria-hidden="true">{profileInitial(name)}</span>
							)}
						</div>
						<div>
							<label
								className="inline-flex cursor-pointer rounded-lg border border-line bg-slate-800 px-3 py-2 font-semibold text-slate-200 text-sm transition hover:border-mint"
								htmlFor="profile-image"
							>
								Choose profile image
							</label>
							<input
								accept={PROFILE_IMAGE_ACCEPT}
								className="sr-only"
								id="profile-image"
								onChange={(event) => {
									const [file] = Array.from(event.target.files ?? []);
									if (file) {
										if (
											PROFILE_IMAGE_TYPES.some((type) => type === file.type)
										) {
											setImage(file);
											setError('');
										} else {
											setError('Choose a JPEG, PNG, or WebP profile image.');
										}
									}
									event.target.value = '';
								}}
								type="file"
							/>
							{image ? (
								<button
									className="ml-3 rounded-sm font-semibold text-rose-300 text-sm hover:text-rose-200"
									onClick={() => setImage(undefined)}
									type="button"
								>
									Remove
								</button>
							) : null}
							<p className={helpClass}>
								JPEG, PNG, or WebP. Stored only in this browser.
							</p>
						</div>
					</div>

					<div className="mt-6 grid gap-5 sm:grid-cols-2">
						<label className={labelClass} htmlFor="profile-name">
							Name
							<input
								className={fieldClass}
								id="profile-name"
								maxLength={MAXIMUM_PROFILE_NAME_LENGTH}
								onChange={(event) => setName(event.target.value)}
								placeholder="Your name"
								value={name}
							/>
						</label>
						<label className={labelClass} htmlFor="profile-identity">
							Sex or gender identity{' '}
							<span className="font-normal text-slate-500">(optional)</span>
							<input
								className={fieldClass}
								id="profile-identity"
								list="profile-identity-suggestions"
								maxLength={MAXIMUM_PROFILE_IDENTITY_LENGTH}
								onChange={(event) => setIdentity(event.target.value)}
								placeholder="Choose or describe your own"
								value={identity}
							/>
							<datalist id="profile-identity-suggestions">
								{PROFILE_IDENTITY_SUGGESTIONS.map((suggestion) => (
									<option key={suggestion} value={suggestion} />
								))}
							</datalist>
							<span className={helpClass}>
								Optional and never used in workout calculations.
							</span>
						</label>
						<label className={labelClass} htmlFor="profile-rider-weight">
							Your weight ({weightUnit})
							<input
								className={fieldClass}
								id="profile-rider-weight"
								inputMode="decimal"
								max={riderRange.maximum}
								min={riderRange.minimum}
								onChange={(event) => setRiderWeight(event.target.value)}
								step="0.1"
								type="number"
								value={riderWeight}
							/>
						</label>
						<label className={labelClass} htmlFor="profile-bike-weight">
							Bike weight ({weightUnit})
							<input
								className={fieldClass}
								id="profile-bike-weight"
								inputMode="decimal"
								max={bikeRange.maximum}
								min={bikeRange.minimum}
								onChange={(event) => setBikeWeight(event.target.value)}
								step="0.1"
								type="number"
								value={bikeWeight}
							/>
						</label>
						<label className={labelClass} htmlFor="profile-front-chainrings">
							Front chainrings
							<input
								className={fieldClass}
								id="profile-front-chainrings"
								inputMode="numeric"
								onChange={(event) => setFrontChainrings(event.target.value)}
								placeholder="53/39"
								value={frontChainrings}
							/>
							<span className={helpClass}>
								Teeth separated by slashes, such as 53/39.
							</span>
						</label>
						<label className={labelClass} htmlFor="profile-rear-cassette">
							Rear cassette
							<input
								className={fieldClass}
								id="profile-rear-cassette"
								inputMode="numeric"
								onChange={(event) => setRearCassette(event.target.value)}
								placeholder="12/13/14/15/16/17/18/19/20/21/22/24"
								value={rearCassette}
							/>
							<span className={helpClass}>
								Teeth separated by slashes. This setup creates {gearCount || '—'}{' '}
								virtual gears.
							</span>
						</label>
					</div>

					<p className="mt-5 rounded-xl border border-line bg-[#10151a] px-4 py-3 text-slate-400 text-sm leading-6">
						Rider and bike weight adjust terrain load. Chainring and cassette sizes
						define the virtual gear ratios. Your profile stays in IndexedDB on this
						device.
					</p>
					{error || storageError ? (
						<p className="mt-4 text-rose-300 text-sm" role="alert">
							{error || storageError}
						</p>
					) : null}
					<div className="mt-5 flex justify-end gap-2">
						<button
							className="rounded-lg px-4 py-2.5 font-semibold text-slate-400 text-sm hover:bg-slate-800 hover:text-slate-200"
							disabled={saving}
							onClick={onClose}
							type="button"
						>
							Cancel
						</button>
						<button
							className="rounded-lg border border-mint/50 bg-mint/15 px-4 py-2.5 font-bold text-mint text-sm hover:bg-mint/20 disabled:opacity-50"
							disabled={saving}
							type="submit"
						>
							{saving ? 'Saving…' : 'Save profile'}
						</button>
					</div>
				</form>
			</section>
		</div>
	);
}
