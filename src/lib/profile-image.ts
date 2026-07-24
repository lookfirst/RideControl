import { PROFILE_IMAGE_TYPES } from './profile';

export const MAXIMUM_PROFILE_IMAGE_SOURCE_BYTES = 32 * 1024 * 1024;
export const MAXIMUM_PREPARED_PROFILE_IMAGE_BYTES = 512 * 1024;
export const TARGET_PROFILE_IMAGE_BYTES = 128 * 1024;
export const MAXIMUM_PROFILE_IMAGE_EDGE = 512;

const PROFILE_IMAGE_OUTPUT_TYPE = 'image/webp';
const PROFILE_IMAGE_ENCODING_ATTEMPTS = [
	{ quality: 0.82, scale: 1 },
	{ quality: 0.7, scale: 1 },
	{ quality: 0.7, scale: 0.875 },
	{ quality: 0.64, scale: 0.75 },
	{ quality: 0.58, scale: 0.625 },
] as const;

export interface ProfileImageDimensions {
	height: number;
	width: number;
}

export interface DecodedProfileImage extends ProfileImageDimensions {
	close: () => void;
	encode: (dimensions: ProfileImageDimensions, quality: number) => Promise<Blob>;
}

export type ProfileImageDecoder = (image: Blob) => Promise<DecodedProfileImage>;

function positiveImageDimension(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

export function resizedProfileImageDimensions(
	width: number,
	height: number,
	maximumEdge = MAXIMUM_PROFILE_IMAGE_EDGE
): ProfileImageDimensions {
	if (
		!(
			positiveImageDimension(width) &&
			positiveImageDimension(height) &&
			positiveImageDimension(maximumEdge)
		)
	) {
		throw new Error('The profile image has invalid dimensions.');
	}
	const scale = Math.min(1, maximumEdge / Math.max(width, height));
	return {
		height: Math.max(1, Math.round(height * scale)),
		width: Math.max(1, Math.round(width * scale)),
	};
}

function scaledProfileImageDimensions(
	dimensions: ProfileImageDimensions,
	scale: number
): ProfileImageDimensions {
	return {
		height: Math.max(1, Math.round(dimensions.height * scale)),
		width: Math.max(1, Math.round(dimensions.width * scale)),
	};
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob?.type === PROFILE_IMAGE_OUTPUT_TYPE) {
					resolve(blob);
				} else {
					reject(new Error('This browser could not compress the profile image.'));
				}
			},
			PROFILE_IMAGE_OUTPUT_TYPE,
			quality
		);
	});
}

async function decodeProfileImage(image: Blob): Promise<DecodedProfileImage> {
	const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
	return {
		close: () => bitmap.close(),
		encode: async (dimensions, quality) => {
			const canvas = document.createElement('canvas');
			canvas.height = dimensions.height;
			canvas.width = dimensions.width;
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('This browser could not prepare the profile image.');
			}
			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = 'high';
			context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
			return await canvasToWebp(canvas, quality);
		},
		height: bitmap.height,
		width: bitmap.width,
	};
}

function validateProfileImageSource(image: Blob): void {
	if (!PROFILE_IMAGE_TYPES.some((type) => type === image.type)) {
		throw new Error('Choose a JPEG, PNG, or WebP profile image.');
	}
	if (image.size > MAXIMUM_PROFILE_IMAGE_SOURCE_BYTES) {
		throw new Error('Choose a profile image smaller than 32 MB.');
	}
}

export async function prepareProfileImage(
	image: Blob,
	decode: ProfileImageDecoder = decodeProfileImage
): Promise<Blob> {
	validateProfileImageSource(image);
	const source = await decode(image);
	try {
		const baseDimensions = resizedProfileImageDimensions(source.width, source.height);
		if (
			image.type === PROFILE_IMAGE_OUTPUT_TYPE &&
			image.size <= TARGET_PROFILE_IMAGE_BYTES &&
			baseDimensions.width === source.width &&
			baseDimensions.height === source.height
		) {
			return image;
		}
		let smallest: Blob | undefined;
		for (const attempt of PROFILE_IMAGE_ENCODING_ATTEMPTS) {
			const prepared = await source.encode(
				scaledProfileImageDimensions(baseDimensions, attempt.scale),
				attempt.quality
			);
			if (!(smallest && smallest.size <= prepared.size)) {
				smallest = prepared;
			}
			if (prepared.size <= TARGET_PROFILE_IMAGE_BYTES) {
				return prepared;
			}
		}
		if (smallest && smallest.size <= MAXIMUM_PREPARED_PROFILE_IMAGE_BYTES) {
			return smallest;
		}
		throw new Error('This image could not be compressed enough for your profile.');
	} finally {
		source.close();
	}
}
