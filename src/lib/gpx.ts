import type { GeographicRoutePoint } from '../types';
import { kilometersForMeters } from './units';
import { xmlChild, xmlDescendant, xmlDescendants, xmlNumber, xmlText } from './xml';

const EARTH_RADIUS_METERS = 6_371_000;
const MINIMUM_GPX_POINTS = 3;
const DISTANCE_EPSILON = 0.000_001;

export interface ParsedGpxTrack {
	description: string;
	name: string;
	points: GeographicRoutePoint[];
}

interface GpxPointSource {
	distance?: number;
	elevation: number;
	latitude: number;
	longitude: number;
}

export function distanceBetween(
	latitudeA: number,
	longitudeA: number,
	latitudeB: number,
	longitudeB: number
): number {
	const radians = Math.PI / 180;
	const latitudeDelta = (latitudeB - latitudeA) * radians;
	const longitudeDelta = (longitudeB - longitudeA) * radians;
	const haversine =
		Math.sin(latitudeDelta / 2) ** 2 +
		Math.cos(latitudeA * radians) *
			Math.cos(latitudeB * radians) *
			Math.sin(longitudeDelta / 2) ** 2;
	return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function validCoordinate(latitude: number | undefined, longitude: number | undefined): boolean {
	return (
		latitude !== undefined &&
		longitude !== undefined &&
		latitude >= -90 &&
		latitude <= 90 &&
		longitude >= -180 &&
		longitude <= 180
	);
}

function gpxPoint(element: Element): GpxPointSource {
	const latitude = Number(element.getAttribute('lat'));
	const longitude = Number(element.getAttribute('lon'));
	const elevation = xmlNumber(xmlChild(element, 'ele'));
	if (!(validCoordinate(latitude, longitude) && elevation !== undefined)) {
		throw new Error('Every GPX route point must include valid coordinates and elevation data.');
	}
	return {
		distance: xmlNumber(xmlDescendant(element, 'DistanceKilometers')),
		elevation,
		latitude,
		longitude,
	};
}

function customDistancesAreValid(points: GpxPointSource[]): boolean {
	return points.every((point, index) => {
		if (point.distance === undefined || point.distance < 0) {
			return false;
		}
		const previous = points[index - 1]?.distance;
		return previous === undefined
			? point.distance <= DISTANCE_EPSILON
			: point.distance > previous;
	});
}

function routePoints(points: GpxPointSource[]): GeographicRoutePoint[] {
	const useCustomDistances = customDistancesAreValid(points);
	let totalMeters = 0;
	return points.map((point, index) => {
		const previous = points[index - 1];
		if (previous) {
			totalMeters += distanceBetween(
				previous.latitude,
				previous.longitude,
				point.latitude,
				point.longitude
			);
		}
		return {
			distance: useCustomDistances ? (point.distance ?? 0) : kilometersForMeters(totalMeters),
			elevation: point.elevation,
			latitude: point.latitude,
			longitude: point.longitude,
		};
	});
}

function parserFailed(xml: Document): boolean {
	return (
		xml.documentElement?.localName === 'parsererror' ||
		xml.getElementsByTagName('parsererror').length > 0
	);
}

export function parseGpxDocument(xml: Document): ParsedGpxTrack {
	if (parserFailed(xml)) {
		throw new Error('The workout file is not valid GPX XML.');
	}
	const root = xml.documentElement;
	const track = xmlDescendant(root, 'trk');
	const route = xmlDescendant(root, 'rte');
	const container = track ?? route;
	if (!container) {
		throw new Error('The GPX file does not contain a track or route.');
	}
	const pointName = track ? 'trkpt' : 'rtept';
	const sourcePoints = xmlDescendants(container, pointName).map(gpxPoint);
	if (sourcePoints.length < MINIMUM_GPX_POINTS) {
		throw new Error('A workout GPX file needs at least three route points.');
	}
	const metadata = xmlDescendant(root, 'metadata');
	return {
		description:
			xmlText(xmlChild(container, 'desc')) || xmlText(xmlChild(metadata ?? root, 'desc')),
		name: xmlText(xmlChild(container, 'name')) || xmlText(xmlChild(metadata ?? root, 'name')),
		points: routePoints(sourcePoints),
	};
}

export function parseGpx(
	source: string,
	parser: DOMParser = new DOMParser()
): GeographicRoutePoint[] {
	return parseGpxDocument(parser.parseFromString(source, 'text/xml')).points;
}
