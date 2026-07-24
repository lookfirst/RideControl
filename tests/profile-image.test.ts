import { describe, expect, test } from 'bun:test';
import {
	type DecodedProfileImage,
	MAXIMUM_PREPARED_PROFILE_IMAGE_BYTES,
	prepareProfileImage,
	resizedProfileImageDimensions,
	TARGET_PROFILE_IMAGE_BYTES,
} from '../src/lib/profile-image';

function imageBlob(size: number, type = 'image/webp'): Blob {
	return new Blob([new Uint8Array(size)], { type });
}

describe('profile image preparation', () => {
	test('bounds the longest edge without enlarging a small image', () => {
		expect(resizedProfileImageDimensions(4000, 2000)).toEqual({
			height: 256,
			width: 512,
		});
		expect(resizedProfileImageDimensions(200, 400)).toEqual({
			height: 400,
			width: 200,
		});
		expect(() => resizedProfileImageDimensions(0, 400)).toThrow(
			'The profile image has invalid dimensions.'
		);
	});

	test('re-encodes a large source until it is comfortably below the target', async () => {
		const attempts: { height: number; quality: number; width: number }[] = [];
		let closed = false;
		const sizes = [TARGET_PROFILE_IMAGE_BYTES + 1, TARGET_PROFILE_IMAGE_BYTES - 1];
		const decode = (): Promise<DecodedProfileImage> =>
			Promise.resolve({
				close: () => {
					closed = true;
				},
				encode: (dimensions, quality) => {
					attempts.push({ ...dimensions, quality });
					return Promise.resolve(imageBlob(sizes.shift() ?? 0));
				},
				height: 2000,
				width: 4000,
			});
		const prepared = await prepareProfileImage(imageBlob(1024, 'image/jpeg'), decode);

		expect(prepared.size).toBe(TARGET_PROFILE_IMAGE_BYTES - 1);
		expect(prepared.type).toBe('image/webp');
		expect(attempts).toEqual([
			{ height: 256, quality: 0.82, width: 512 },
			{ height: 256, quality: 0.7, width: 512 },
		]);
		expect(closed).toBeTrue();
	});

	test('does not degrade an already prepared WebP image', async () => {
		const image = imageBlob(TARGET_PROFILE_IMAGE_BYTES);
		let encoded = false;
		let closed = false;
		const prepared = await prepareProfileImage(image, () =>
			Promise.resolve({
				close: () => {
					closed = true;
				},
				encode: () => {
					encoded = true;
					return Promise.resolve(imageBlob(1));
				},
				height: 256,
				width: 256,
			})
		);

		expect(prepared).toBe(image);
		expect(encoded).toBeFalse();
		expect(closed).toBeTrue();
	});

	test('rejects an unsafe source size before decoding it', async () => {
		const image = imageBlob(1, 'image/jpeg');
		Object.defineProperty(image, 'size', { value: 32 * 1024 * 1024 + 1 });
		let decoded = false;
		const preparation = prepareProfileImage(image, () => {
			decoded = true;
			throw new Error('The decoder should not run.');
		});

		await expect(preparation).rejects.toThrow('Choose a profile image smaller than 32 MB.');
		expect(decoded).toBeFalse();
	});

	test('rejects an image that remains above the prepared-image safety ceiling', async () => {
		let closed = false;
		const preparation = prepareProfileImage(imageBlob(1024, 'image/png'), () =>
			Promise.resolve({
				close: () => {
					closed = true;
				},
				encode: () => Promise.resolve(imageBlob(MAXIMUM_PREPARED_PROFILE_IMAGE_BYTES + 1)),
				height: 1024,
				width: 1024,
			})
		);

		await expect(preparation).rejects.toThrow(
			'This image could not be compressed enough for your profile.'
		);
		expect(closed).toBeTrue();
	});
});
