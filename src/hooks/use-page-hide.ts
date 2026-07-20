import { useEffect, useRef } from 'react';

export function usePageHide(onPageHide: () => void) {
	const callback = useRef(onPageHide);
	callback.current = onPageHide;

	useEffect(() => {
		const handlePageHide = () => callback.current();
		window.addEventListener('pagehide', handlePageHide);
		return () => window.removeEventListener('pagehide', handlePageHide);
	}, []);
}
