import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../lib/errors';
import {
	fetchGpxCatalog,
	fetchGpxProviders,
	type GpxCatalog,
	type GpxProviderCatalog,
} from '../lib/gpx-provider';

let providersRequest: Promise<GpxProviderCatalog[]> | undefined;
const catalogRequests = new Map<string, Promise<GpxCatalog>>();

function requestProviders(): Promise<GpxProviderCatalog[]> {
	providersRequest ??= fetchGpxProviders().finally(() => {
		providersRequest = undefined;
	});
	return providersRequest;
}

function requestCatalog(providerId: string, collectionId: string): Promise<GpxCatalog> {
	const key = `${providerId}/${collectionId}`;
	const pending = catalogRequests.get(key);
	if (pending) {
		return pending;
	}
	const request = fetchGpxCatalog(providerId, collectionId).finally(() => {
		catalogRequests.delete(key);
	});
	catalogRequests.set(key, request);
	return request;
}

function useGpxRequest<T>(active: boolean, request: () => Promise<T>) {
	const [data, setData] = useState<T>();
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!active) {
			return;
		}
		let cancelled = false;
		setError('');
		setLoading(true);
		request()
			.then((nextData) => {
				if (!cancelled) {
					setData(nextData);
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
		return () => {
			cancelled = true;
		};
	}, [active, request]);

	const refresh = useCallback(async () => {
		setError('');
		setLoading(true);
		try {
			setData(await request());
		} catch (nextError) {
			setError(errorMessage(nextError));
		} finally {
			setLoading(false);
		}
	}, [request]);

	return { data, error, loading, refresh };
}

export function useGpxProviders(active: boolean) {
	const request = useCallback(() => requestProviders(), []);
	const result = useGpxRequest(active, request);
	return { ...result, providers: result.data };
}

export function useGpxCatalog(active: boolean, providerId: string, collectionId: string) {
	const request = useCallback(
		() => requestCatalog(providerId, collectionId),
		[collectionId, providerId]
	);
	const result = useGpxRequest(active && Boolean(providerId && collectionId), request);
	const catalog =
		result.data?.provider.id === providerId && result.data.collection.id === collectionId
			? result.data
			: undefined;
	return { ...result, catalog };
}
