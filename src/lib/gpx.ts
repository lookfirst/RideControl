import type { RoutePoint } from '../types';
import { kilometersForMeters } from './units';

export function distanceBetween(a: number, b: number, c: number, d: number) {
	const rad = Math.PI / 180;
	const x = (c - a) * rad;
	const y = (d - b) * rad;
	const q = Math.sin(x / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(y / 2) ** 2;
	return 6_371_000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

export function parseGpx(source: string, parser: DOMParser = new DOMParser()): RoutePoint[] {
	const xml = parser.parseFromString(source, 'text/xml');
	const points = [...xml.querySelectorAll('trkpt')];
	let total = 0;
	let previous: { lat: number; lon: number } | undefined;
	return points.map((point) => {
		const lat = Number(point.getAttribute('lat'));
		const lon = Number(point.getAttribute('lon'));
		if (previous) {
			total += distanceBetween(previous.lat, previous.lon, lat, lon);
		}
		previous = { lat, lon };
		return {
			distance: kilometersForMeters(total),
			elevation: Number(point.querySelector('ele')?.textContent ?? 0),
		};
	});
}
