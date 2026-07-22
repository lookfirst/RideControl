import { useCallback, useEffect, useState } from 'react';
import { type BikeGpxCatalog, fetchBikeGpxCatalog } from '../lib/bikegpx';
import { errorMessage } from '../lib/errors';

const CATALOG_REFRESH_INTERVAL_MS = 15_000;
let catalogRequest: Promise<BikeGpxCatalog> | undefined;

function requestCatalog(): Promise<BikeGpxCatalog> {
	catalogRequest ??= fetchBikeGpxCatalog().finally(() => {
		catalogRequest = undefined;
	});
	return catalogRequest;
}

export function useBikeGpxCatalog(active: boolean) {
	const [catalog, setCatalog] = useState<BikeGpxCatalog>();
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!active) {
			return;
		}
		let cancelled = false;
		let initialRequest = true;
		const loadCatalog = () => {
			if (initialRequest) {
				setError('');
				setLoading(true);
				initialRequest = false;
			}
			requestCatalog()
				.then((nextCatalog) => {
					if (!cancelled) {
						setCatalog(nextCatalog);
						setError('');
					}
				})
				.catch((nextError) => {
					if (!cancelled) {
						setError(errorMessage(nextError));
					}
				})
				.finally(() => {
					if (!cancelled) {
						setLoading(false);
					}
				});
		};
		loadCatalog();
		const refreshInterval = window.setInterval(loadCatalog, CATALOG_REFRESH_INTERVAL_MS);
		return () => {
			cancelled = true;
			window.clearInterval(refreshInterval);
		};
	}, [active]);

	const refresh = useCallback(async () => {
		setError('');
		setLoading(true);
		try {
			setCatalog(await requestCatalog());
		} catch (nextError) {
			setError(errorMessage(nextError));
		} finally {
			setLoading(false);
		}
	}, []);

	return { catalog, error, loading, refresh };
}
