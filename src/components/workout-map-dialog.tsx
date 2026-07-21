import {
	circleMarker,
	map as createLeafletMap,
	divIcon,
	type LatLngExpression,
	marker,
	polyline,
	tileLayer,
} from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { useCloseOnEscape } from '../hooks/use-dialog-behavior';
import { workoutRouteCoordinateAtProgress } from '../lib/workout-map';
import type { WorkoutCourse } from '../types';

const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const MAP_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ROUTE_COLOR = '#67e8f9';
const ROUTE_OUTLINE_COLOR = '#071018';
const START_COLOR = '#adf5bd';
const FINISH_COLOR = '#fbbf24';
const ENDPOINT_EPSILON = 0.000_001;
const BIKE_ROUTE_DURATION_MS = 30_000;
const BIKE_MARKER_HTML =
	'<span class="ride-control-bike-marker__body" aria-hidden="true">🚲</span>';

function routeCoordinates(course: WorkoutCourse): LatLngExpression[] {
	return course.points.map((point) => [point.latitude, point.longitude]);
}

function endpointsOverlap(course: WorkoutCourse): boolean {
	const [start] = course.points;
	const finish = course.points.at(-1);
	return Boolean(
		start &&
			finish &&
			Math.abs(start.latitude - finish.latitude) < ENDPOINT_EPSILON &&
			Math.abs(start.longitude - finish.longitude) < ENDPOINT_EPSILON
	);
}

function WorkoutRouteMap({ course }: { course: WorkoutCourse }) {
	const mapContainer = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = mapContainer.current;
		if (!container) {
			return;
		}
		const coordinates = routeCoordinates(course);
		const [start] = coordinates;
		const finish = coordinates.at(-1);
		if (!start) {
			return;
		}

		const routeMap = createLeafletMap(container, {
			attributionControl: true,
			zoomControl: true,
		});
		tileLayer(MAP_TILE_URL, {
			attribution: MAP_ATTRIBUTION,
			className: 'ride-control-map-tiles',
			maxZoom: 19,
		}).addTo(routeMap);

		const routeOutline = polyline(coordinates, {
			color: ROUTE_OUTLINE_COLOR,
			opacity: 0.75,
			weight: 9,
		}).addTo(routeMap);
		polyline(coordinates, {
			color: ROUTE_COLOR,
			lineCap: 'round',
			lineJoin: 'round',
			opacity: 0.95,
			weight: 5,
		}).addTo(routeMap);

		const sharedEndpoint = endpointsOverlap(course);
		circleMarker(start, {
			color: ROUTE_OUTLINE_COLOR,
			fillColor: START_COLOR,
			fillOpacity: 1,
			radius: 7,
			weight: 3,
		})
			.bindTooltip(sharedEndpoint ? 'Start and finish' : 'Start')
			.addTo(routeMap);
		if (finish && !sharedEndpoint) {
			circleMarker(finish, {
				color: ROUTE_OUTLINE_COLOR,
				fillColor: FINISH_COLOR,
				fillOpacity: 1,
				radius: 7,
				weight: 3,
			})
				.bindTooltip('Finish')
				.addTo(routeMap);
		}

		const bikePosition = workoutRouteCoordinateAtProgress(course.points, 0);
		let animationFrame = 0;
		if (bikePosition) {
			const bike = marker([bikePosition.latitude, bikePosition.longitude], {
				icon: divIcon({
					className: 'ride-control-bike-marker',
					html: BIKE_MARKER_HTML,
					iconAnchor: [17, 17],
					iconSize: [34, 34],
				}),
				interactive: false,
				keyboard: false,
				title: 'Bike riding the route',
				zIndexOffset: 1000,
			}).addTo(routeMap);
			let animationStart: number | undefined;
			const animateBike = (timestamp: number) => {
				animationStart ??= timestamp;
				const progress =
					((timestamp - animationStart) % BIKE_ROUTE_DURATION_MS) /
					BIKE_ROUTE_DURATION_MS;
				const position = workoutRouteCoordinateAtProgress(course.points, progress);
				if (position) {
					bike.setLatLng([position.latitude, position.longitude]);
				}
				animationFrame = window.requestAnimationFrame(animateBike);
			};
			animationFrame = window.requestAnimationFrame(animateBike);
		}

		const bounds = routeOutline.getBounds();
		if (bounds.isValid()) {
			routeMap.fitBounds(bounds, { maxZoom: 16, padding: [48, 48] });
		} else {
			routeMap.setView(start, 14);
		}

		return () => {
			window.cancelAnimationFrame(animationFrame);
			routeMap.remove();
		};
	}, [course]);

	return (
		<section aria-label={`${course.name} route map`} className="relative min-h-96 flex-1">
			<div className="absolute inset-0" ref={mapContainer} />
			<div className="pointer-events-none absolute top-4 right-4 z-500 rounded-xl border border-slate-600/70 bg-[#10151a]/90 px-3 py-2 text-[11px] text-slate-300 shadow-xl backdrop-blur-sm">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-full bg-mint" />
					<span>{endpointsOverlap(course) ? 'Start and finish' : 'Start'}</span>
				</div>
				{endpointsOverlap(course) ? null : (
					<div className="mt-1.5 flex items-center gap-2">
						<span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
						<span>Finish</span>
					</div>
				)}
			</div>
		</section>
	);
}

export function WorkoutMapDialog({
	course,
	onClose,
}: {
	course: WorkoutCourse;
	onClose: () => void;
}) {
	useCloseOnEscape(true, onClose);

	return (
		<div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]">
			<button
				aria-label="Dismiss workout map"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onClose}
				type="button"
			/>
			<section
				aria-labelledby="workout-map-dialog-title"
				aria-modal="true"
				className="absolute inset-4 z-10 flex flex-col overflow-hidden rounded-2xl border border-slate-600 bg-panel shadow-2xl shadow-black/70 xl:top-6 xl:right-152 xl:bottom-6 xl:left-6"
				role="dialog"
			>
				<header className="flex items-start gap-4 border-line border-b bg-[#12171d] px-5 py-4 sm:px-6">
					<div className="mr-auto min-w-0">
						<h2 className="truncate font-bold text-xl" id="workout-map-dialog-title">
							{course.name}
						</h2>
						<p className="mt-1 text-slate-400 text-xs leading-relaxed">
							{course.description}
						</p>
					</div>
					<button
						aria-label="Close workout map"
						autoFocus
						className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</header>
				<WorkoutRouteMap course={course} />
			</section>
		</div>
	);
}
