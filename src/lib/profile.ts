import { indexedDbRequestResult, indexedDbTransactionComplete } from './indexed-db';
import { isFiniteNumber, isRecord, isString } from './type-guards';

const DATABASE_NAME = 'ridecontrol-profile';
const DATABASE_VERSION = 1;
const PROFILE_ID = 'current';
const PROFILE_STORE = 'profile';
const PROFILE_VERSION = 1;
const TEETH_SEPARATOR = /[\s,/]+/u;

export const DEFAULT_RIDER_WEIGHT_KG = 75;
export const DEFAULT_BIKE_WEIGHT_KG = 9;
export const KILOGRAMS_PER_POUND = 0.453_592_37;
export const MINIMUM_RIDER_WEIGHT_KG = 20;
export const MAXIMUM_RIDER_WEIGHT_KG = 350;
export const MINIMUM_BIKE_WEIGHT_KG = 2;
export const MAXIMUM_BIKE_WEIGHT_KG = 80;
export const MAXIMUM_PROFILE_NAME_LENGTH = 100;
export const MAXIMUM_PROFILE_IDENTITY_LENGTH = 100;
export const MAXIMUM_VIRTUAL_GEARS = 24;
export const MINIMUM_DRIVETRAIN_TEETH = 5;
export const MAXIMUM_DRIVETRAIN_TEETH = 100;
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PROFILE_IMAGE_ACCEPT = PROFILE_IMAGE_TYPES.join(',');
export const DEFAULT_FRONT_CHAINRING_TEETH = [53, 39] as const;
export const DEFAULT_REAR_CASSETTE_TEETH = [
	12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24,
] as const;

export const PROFILE_IDENTITY_SUGGESTIONS = [
	'Woman',
	'Man',
	'Non-binary',
	'Agender',
	'Genderfluid',
	'Genderqueer',
	'Intersex',
	'Questioning',
	'Two-Spirit',
	'Prefer not to say',
] as const;

export interface VirtualDrivetrain {
	frontChainringTeeth: readonly number[];
	rearCassetteTeeth: readonly number[];
}

export interface RiderProfile extends VirtualDrivetrain {
	bikeWeightKg: number;
	identity: string;
	image?: Blob;
	name: string;
	riderWeightKg: number;
}

interface StoredRiderProfile extends RiderProfile {
	id: typeof PROFILE_ID;
	updatedAt: number;
	version: typeof PROFILE_VERSION;
}

export const DEFAULT_RIDER_PROFILE: RiderProfile = {
	bikeWeightKg: DEFAULT_BIKE_WEIGHT_KG,
	frontChainringTeeth: DEFAULT_FRONT_CHAINRING_TEETH,
	identity: '',
	name: '',
	rearCassetteTeeth: DEFAULT_REAR_CASSETTE_TEETH,
	riderWeightKg: DEFAULT_RIDER_WEIGHT_KG,
};

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
	if (databasePromise) {
		return databasePromise;
	}
	databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.addEventListener(
			'upgradeneeded',
			() => {
				if (!request.result.objectStoreNames.contains(PROFILE_STORE)) {
					request.result.createObjectStore(PROFILE_STORE, { keyPath: 'id' });
				}
			},
			{ once: true }
		);
		request.addEventListener('success', () => resolve(request.result), { once: true });
		request.addEventListener('error', () => reject(request.error), { once: true });
	});
	return databasePromise;
}

function numericArray(value: unknown): number[] | undefined {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some(
			(item) =>
				!(
					isFiniteNumber(item) &&
					Number.isInteger(item) &&
					item >= MINIMUM_DRIVETRAIN_TEETH &&
					item <= MAXIMUM_DRIVETRAIN_TEETH
				)
		) ||
		new Set(value).size !== value.length
	) {
		return;
	}
	return value;
}

function isProfileImage(value: unknown): value is Blob {
	return value instanceof Blob && PROFILE_IMAGE_TYPES.some((type) => type === value.type);
}

export function profileFromStoredValue(value: unknown): RiderProfile | undefined {
	if (!(isRecord(value) && value.version === PROFILE_VERSION)) {
		return;
	}
	const frontChainringTeeth = numericArray(value.frontChainringTeeth);
	const rearCassetteTeeth = numericArray(value.rearCassetteTeeth);
	if (
		!(
			isString(value.name) &&
			isString(value.identity) &&
			isFiniteNumber(value.riderWeightKg) &&
			isFiniteNumber(value.bikeWeightKg) &&
			frontChainringTeeth &&
			rearCassetteTeeth
		) ||
		value.name.length > MAXIMUM_PROFILE_NAME_LENGTH ||
		value.identity.length > MAXIMUM_PROFILE_IDENTITY_LENGTH ||
		value.riderWeightKg < MINIMUM_RIDER_WEIGHT_KG ||
		value.riderWeightKg > MAXIMUM_RIDER_WEIGHT_KG ||
		value.bikeWeightKg < MINIMUM_BIKE_WEIGHT_KG ||
		value.bikeWeightKg > MAXIMUM_BIKE_WEIGHT_KG ||
		frontChainringTeeth.length > 3 ||
		frontChainringTeeth.length * rearCassetteTeeth.length > MAXIMUM_VIRTUAL_GEARS
	) {
		return;
	}
	const image = isProfileImage(value.image) ? value.image : undefined;
	return {
		bikeWeightKg: value.bikeWeightKg,
		frontChainringTeeth,
		identity: value.identity,
		image,
		name: value.name,
		rearCassetteTeeth,
		riderWeightKg: value.riderWeightKg,
	};
}

export async function loadRiderProfile(): Promise<RiderProfile> {
	const database = await openDatabase();
	const transaction = database.transaction(PROFILE_STORE, 'readonly');
	const completed = indexedDbTransactionComplete(transaction);
	const value: unknown = await indexedDbRequestResult(
		transaction.objectStore(PROFILE_STORE).get(PROFILE_ID)
	);
	await completed;
	return profileFromStoredValue(value) ?? DEFAULT_RIDER_PROFILE;
}

export async function saveRiderProfile(profile: RiderProfile): Promise<void> {
	const candidate = {
		...profile,
		frontChainringTeeth: [...profile.frontChainringTeeth],
		id: PROFILE_ID,
		rearCassetteTeeth: [...profile.rearCassetteTeeth],
		updatedAt: Date.now(),
		version: PROFILE_VERSION,
	};
	const validatedProfile = profileFromStoredValue(candidate);
	if (!validatedProfile) {
		throw new Error('Invalid rider profile');
	}
	const database = await openDatabase();
	const transaction = database.transaction(PROFILE_STORE, 'readwrite');
	const completed = indexedDbTransactionComplete(transaction);
	const record: StoredRiderProfile = {
		...validatedProfile,
		id: PROFILE_ID,
		updatedAt: candidate.updatedAt,
		version: PROFILE_VERSION,
	};
	transaction.objectStore(PROFILE_STORE).put(record);
	await completed;
}

export function drivetrainGearCount(drivetrain: VirtualDrivetrain): number {
	return drivetrain.frontChainringTeeth.length * drivetrain.rearCassetteTeeth.length;
}

export function profileTotalMassKg(profile: RiderProfile): number {
	return profile.riderWeightKg + profile.bikeWeightKg;
}

export function poundsForKilograms(kilograms: number): number {
	return kilograms / KILOGRAMS_PER_POUND;
}

export function kilogramsForPounds(pounds: number): number {
	return pounds * KILOGRAMS_PER_POUND;
}

export function formattedTeeth(teeth: readonly number[]): string {
	return teeth.join('/');
}

export function parsedTeeth(value: string): number[] | undefined {
	const parts = value.trim().split(TEETH_SEPARATOR).filter(Boolean);
	if (parts.length === 0) {
		return;
	}
	const teeth = parts.map(Number);
	if (teeth.some((tooth) => !(Number.isFinite(tooth) && Number.isInteger(tooth) && tooth > 0))) {
		return;
	}
	return teeth;
}
