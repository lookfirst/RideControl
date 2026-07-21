import { useCallback, useEffect, useState } from 'react';
import {
	type BikeGpxCatalog,
	type BikeGpxRouteAnalysis,
	fetchBikeGpxCatalog,
} from '../lib/bikegpx';
import { errorMessage } from '../lib/errors';

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
	const [initialized, setInitialized] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!(active && !initialized)) {
			return;
		}
		let cancelled = false;
		setError('');
		setLoading(true);
		requestCatalog()
			.then((initialCatalog) => {
				if (!cancelled) {
					setCatalog(initialCatalog);
				}
			})
			.catch((initialError) => {
				if (!cancelled) {
					setError(errorMessage(initialError));
				}
			})
			.finally(() => {
				if (!cancelled) {
					setInitialized(true);
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [active, initialized]);

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

	const updateRouteAnalysis = useCallback((routeId: string, analysis: BikeGpxRouteAnalysis) => {
		setCatalog((currentCatalog) =>
			currentCatalog
				? {
						...currentCatalog,
						analyses: { ...currentCatalog.analyses, [routeId]: analysis },
					}
				: currentCatalog
		);
	}, []);

	return { catalog, error, loading, refresh, updateRouteAnalysis };
}
