import { useCallback, useEffect, useState } from 'react';
import {
	DEFAULT_RIDER_PROFILE,
	loadRiderProfile,
	type RiderProfile,
	saveRiderProfile,
} from '../lib/profile';

const PROFILE_STORAGE_ERROR =
	'Your profile could not be loaded from this browser. The default profile is being used.';

export function useProfile() {
	const [profile, setProfile] = useState<RiderProfile>(DEFAULT_RIDER_PROFILE);
	const [ready, setReady] = useState(false);
	const [storageError, setStorageError] = useState('');

	useEffect(() => {
		let active = true;
		loadRiderProfile()
			.then((storedProfile) => {
				if (active) {
					setProfile(storedProfile);
				}
			})
			.catch(() => {
				if (active) {
					setStorageError(PROFILE_STORAGE_ERROR);
				}
			})
			.finally(() => {
				if (active) {
					setReady(true);
				}
			});
		return () => {
			active = false;
		};
	}, []);

	const save = useCallback(async (nextProfile: RiderProfile) => {
		await saveRiderProfile(nextProfile);
		setProfile(nextProfile);
		setStorageError('');
	}, []);

	return { profile, ready, save, storageError };
}
