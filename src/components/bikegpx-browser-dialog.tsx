import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { usePersistentScrollPosition } from '../hooks/use-persistent-scroll-position';
import {
	BIKEGPX_ROUTES_URL,
	type BikeGpxCatalog,
	type BikeGpxRouteAnalysis,
	type BikeGpxRouteResult,
	type BikeGpxRouteSummary,
	bikeGpxPreviewRoute,
	bikeGpxRouteLocation,
	bikeGpxRouteMatchesQuery,
	bikeGpxRouteUrl,
	fetchBikeGpxRoute,
	formatBikeGpxRouteStats,
} from '../lib/bikegpx';
import {
	BIKEGPX_ROUTE_LIST_SCROLL_POSITION_STORAGE_KEY,
	loadBikeGpxBrowserSearch,
	persistBikeGpxBrowserSearch,
} from '../lib/bikegpx-browser-preferences';
import { errorMessage } from '../lib/errors';
import { convertDistance, distanceUnitLabel } from '../lib/units';
import {
	isWorkoutDifficulty,
	WORKOUT_DIFFICULTY,
	WORKOUT_VIEW,
	type WorkoutDifficulty,
} from '../lib/workout-schema';
import { workoutDifficultyLabel } from '../lib/workouts';
import type { SpeedUnit, WorkoutCourse } from '../types';
import { WorkoutRouteMap } from './workout-route-map';
import { WorkoutRouteVisualization } from './workout-route-visualization';

const ESTIMATED_ROUTE_ROW_HEIGHT = 104;
const ROUTE_LIST_OVERSCAN = 6;
const EMPTY_ROUTE_ANALYSES: Record<string, BikeGpxRouteAnalysis> = {};
const routeResultCache = new Map<string, BikeGpxRouteResult>();
const routeResultRequests = new Map<string, Promise<BikeGpxRouteResult>>();

function requestRouteCourse(
	route: BikeGpxRouteSummary,
	useCache = true
): Promise<BikeGpxRouteResult> {
	if (!useCache) {
		routeResultCache.delete(route.id);
	}
	const cached = useCache ? routeResultCache.get(route.id) : undefined;
	if (cached) {
		return Promise.resolve(cached);
	}
	const pending = routeResultRequests.get(route.id);
	if (pending) {
		return pending;
	}
	const request = fetchBikeGpxRoute(route)
		.then((result) => {
			routeResultCache.set(route.id, result);
			return result;
		})
		.finally(() => {
			routeResultRequests.delete(route.id);
		});
	routeResultRequests.set(route.id, request);
	return request;
}

function matchingRoutes(
	routes: BikeGpxRouteSummary[],
	query: string,
	country: string,
	difficulty: WorkoutDifficulty | undefined,
	minimumDistance: string,
	maximumDistance: string,
	speedUnit: SpeedUnit,
	analyses: Record<string, BikeGpxRouteAnalysis>
): BikeGpxRouteSummary[] {
	const minimum = optionalDistance(minimumDistance);
	const maximum = optionalDistance(maximumDistance);
	return routes.filter((route) => {
		const displayedDistance = convertDistance(route.distanceKm, speedUnit);
		const analysis = analyses[route.id];
		return (
			(!country || route.country === country) &&
			(!(difficulty && analysis) || analysis.difficulty === difficulty) &&
			(minimum === undefined || displayedDistance >= minimum) &&
			(maximum === undefined || displayedDistance <= maximum) &&
			bikeGpxRouteMatchesQuery(route, query, analysis)
		);
	});
}

function optionalDistance(value: string): number | undefined {
	const normalized = value.trim();
	if (!normalized) {
		return;
	}
	const distance = Number(normalized);
	return Number.isFinite(distance) && distance >= 0 ? distance : undefined;
}

function RouteListItem({
	analysis,
	onSelect,
	route,
	selected,
	speedUnit,
}: {
	analysis: BikeGpxRouteAnalysis;
	onSelect: () => void;
	route: BikeGpxRouteSummary;
	selected: boolean;
	speedUnit: SpeedUnit;
}) {
	const difficulty = workoutDifficultyLabel(analysis.difficulty);
	const location = bikeGpxRouteLocation(route);
	return (
		<button
			aria-pressed={selected}
			className={`w-full border-line border-b px-4 py-3 text-left transition ${selected ? 'bg-cyan-400/10 shadow-[inset_3px_0_0_#67e8f9]' : 'hover:bg-slate-800/60'}`}
			onClick={onSelect}
			type="button"
		>
			<span
				className={`block font-semibold text-sm ${selected ? 'text-cyan-200' : 'text-slate-200'}`}
			>
				{route.name}
			</span>
			<span className="mt-1 flex items-center justify-between gap-2 text-[11px]">
				<span className="truncate text-slate-500">{route.country}</span>
				<span
					className="shrink-0 rounded-full border border-violet-400/25 bg-violet-400/5 px-1.5 py-0.5 font-semibold text-[9px] text-violet-300 uppercase tracking-wide"
					title="Difficulty calculated from distance, climbing, and maximum grade"
				>
					{difficulty}
				</span>
			</span>
			{location ? (
				<span className="mt-1 block text-[11px] text-slate-400 leading-relaxed">
					{location}
				</span>
			) : null}
			<span className="mt-1 block text-[11px] text-slate-300 tabular-nums">
				{formatBikeGpxRouteStats(route, analysis, speedUnit)}
			</span>
		</button>
	);
}

function RouteSidebar({
	analyses,
	catalog,
	catalogError,
	catalogLoading,
	countries,
	country,
	difficulty,
	maximumDistance,
	minimumDistance,
	onCountryChange,
	onDifficultyChange,
	onMaximumDistanceChange,
	onMinimumDistanceChange,
	onQueryChange,
	onRefreshCatalog,
	onSelectRoute,
	query,
	routes,
	selectedRouteId,
	speedUnit,
}: {
	analyses: Record<string, BikeGpxRouteAnalysis>;
	catalog?: BikeGpxCatalog;
	catalogError: string;
	catalogLoading: boolean;
	countries: string[];
	country: string;
	difficulty?: WorkoutDifficulty;
	maximumDistance: string;
	minimumDistance: string;
	onCountryChange: (country: string) => void;
	onDifficultyChange: (difficulty: WorkoutDifficulty | undefined) => void;
	onMaximumDistanceChange: (distance: string) => void;
	onMinimumDistanceChange: (distance: string) => void;
	onQueryChange: (query: string) => void;
	onRefreshCatalog: () => Promise<void>;
	onSelectRoute: (route: BikeGpxRouteSummary) => void;
	query: string;
	routes: BikeGpxRouteSummary[];
	selectedRouteId: string;
	speedUnit: SpeedUnit;
}) {
	const routeListRef = useRef<HTMLDivElement>(null);
	const routeListScroll = usePersistentScrollPosition<HTMLDivElement>(
		BIKEGPX_ROUTE_LIST_SCROLL_POSITION_STORAGE_KEY,
		true,
		catalog?.fetchedAt
	);
	const setRouteListRef = useCallback(
		(element: HTMLDivElement | null) => {
			routeListRef.current = element;
			routeListScroll.ref(element);
		},
		[routeListScroll.ref]
	);
	const routeKey = useCallback((index: number) => routes[index]?.id ?? index, [routes]);
	const routeVirtualizer = useVirtualizer({
		count: routes.length,
		estimateSize: () => ESTIMATED_ROUTE_ROW_HEIGHT,
		getItemKey: routeKey,
		getScrollElement: () => routeListRef.current,
		overscan: ROUTE_LIST_OVERSCAN,
		useFlushSync: false,
	});
	const selectedIndex = routes.findIndex((route) => route.id === selectedRouteId);

	useEffect(() => {
		if (selectedIndex >= 0) {
			routeVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
		}
	}, [routeVirtualizer, selectedIndex]);

	const distanceUnit = distanceUnitLabel(speedUnit);

	return (
		<aside className="flex h-80 shrink-0 flex-col border-line border-b bg-[#10151a] lg:h-auto lg:w-72 lg:border-r lg:border-b-0">
			<div className="space-y-2 border-line border-b p-3">
				<label className="sr-only" htmlFor="bikegpx-search">
					Search BikeGPX routes
				</label>
				<input
					className="h-10 w-full rounded-lg border border-line bg-[#12171d] px-3 text-slate-100 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10"
					id="bikegpx-search"
					onChange={(event) => onQueryChange(event.currentTarget.value)}
					placeholder="Name, place, distance, or difficulty"
					type="search"
					value={query}
				/>
				<div className="grid grid-cols-2 gap-2">
					<label className="sr-only" htmlFor="bikegpx-country">
						Filter BikeGPX routes by country
					</label>
					<select
						className="h-9 min-w-0 rounded-lg border border-line bg-[#12171d] px-2 text-slate-300 text-xs outline-none focus:border-cyan-400/70"
						id="bikegpx-country"
						onChange={(event) => onCountryChange(event.currentTarget.value)}
						value={country}
					>
						<option value="">All countries</option>
						{countries.map((countryName) => (
							<option key={countryName} value={countryName}>
								{countryName}
							</option>
						))}
					</select>
					<label className="sr-only" htmlFor="bikegpx-difficulty">
						Filter BikeGPX routes by estimated difficulty
					</label>
					<select
						className="h-9 min-w-0 rounded-lg border border-line bg-[#12171d] px-2 text-slate-300 text-xs outline-none focus:border-cyan-400/70"
						id="bikegpx-difficulty"
						onChange={(event) => {
							const { value } = event.currentTarget;
							onDifficultyChange(isWorkoutDifficulty(value) ? value : undefined);
						}}
						value={difficulty ?? ''}
					>
						<option value="">Any difficulty</option>
						{Object.values(WORKOUT_DIFFICULTY).map((option) => (
							<option key={option} value={option}>
								{workoutDifficultyLabel(option)}
							</option>
						))}
					</select>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<label className="sr-only" htmlFor="bikegpx-minimum-distance">
						Minimum route distance in {distanceUnit}
					</label>
					<input
						className="h-9 min-w-0 rounded-lg border border-line bg-[#12171d] px-2 text-slate-200 text-xs outline-none placeholder:text-slate-600 focus:border-cyan-400/70"
						id="bikegpx-minimum-distance"
						min="0"
						onChange={(event) => onMinimumDistanceChange(event.currentTarget.value)}
						placeholder={`Min ${distanceUnit}`}
						step="1"
						type="number"
						value={minimumDistance}
					/>
					<label className="sr-only" htmlFor="bikegpx-maximum-distance">
						Maximum route distance in {distanceUnit}
					</label>
					<input
						className="h-9 min-w-0 rounded-lg border border-line bg-[#12171d] px-2 text-slate-200 text-xs outline-none placeholder:text-slate-600 focus:border-cyan-400/70"
						id="bikegpx-maximum-distance"
						min="0"
						onChange={(event) => onMaximumDistanceChange(event.currentTarget.value)}
						placeholder={`Max ${distanceUnit}`}
						step="1"
						type="number"
						value={maximumDistance}
					/>
				</div>
				<p className="text-[10px] text-slate-600">
					Difficulty uses the route's prepared distance, climbing, and maximum grade.
				</p>
				{catalogError && catalog ? (
					<p className="text-[11px] text-amber-300" role="status">
						{catalogError} The saved route list is still available.
					</p>
				) : null}
			</div>
			<div
				className="min-h-0 flex-1 overflow-y-auto"
				data-testid="bikegpx-route-list"
				onScroll={routeListScroll.onScroll}
				ref={setRouteListRef}
			>
				{routes.length > 0 ? (
					<div
						className="relative w-full"
						style={{ height: `${routeVirtualizer.getTotalSize()}px` }}
					>
						{routeVirtualizer.getVirtualItems().map((virtualRoute) => {
							const route = routes[virtualRoute.index];
							const analysis = route ? analyses[route.id] : undefined;
							return route && analysis ? (
								<div
									className="absolute top-0 left-0 w-full"
									data-index={virtualRoute.index}
									key={route.id}
									ref={routeVirtualizer.measureElement}
									style={{ transform: `translateY(${virtualRoute.start}px)` }}
								>
									<RouteListItem
										analysis={analysis}
										onSelect={() => onSelectRoute(route)}
										route={route}
										selected={route.id === selectedRouteId}
										speedUnit={speedUnit}
									/>
								</div>
							) : null;
						})}
					</div>
				) : null}
				{catalogLoading && !catalog ? (
					<p className="px-4 py-10 text-center text-slate-400 text-sm" role="status">
						Loading BikeGPX routes…
					</p>
				) : null}
				{!catalogLoading && routes.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm">
						<p className="text-slate-400">
							{catalogError || 'No BikeGPX routes match these filters.'}
						</p>
						{catalogError ? (
							<button
								className="mt-3 font-semibold text-cyan-400 text-xs hover:text-cyan-200"
								onClick={onRefreshCatalog}
								type="button"
							>
								Try again
							</button>
						) : null}
					</div>
				) : null}
			</div>
		</aside>
	);
}

function useRoutePreview(route: BikeGpxRouteSummary | undefined) {
	const activeRequest = useRef(0);
	const [course, setCourse] = useState<WorkoutCourse>();
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const load = useCallback((nextRoute: BikeGpxRouteSummary | undefined, useCache = true) => {
		const requestId = activeRequest.current + 1;
		activeRequest.current = requestId;
		if (!nextRoute) {
			setCourse(undefined);
			return;
		}
		setCourse(undefined);
		setError('');
		setLoading(true);
		requestRouteCourse(nextRoute, useCache)
			.then((result) => {
				if (activeRequest.current === requestId) {
					setCourse(result.course);
				}
			})
			.catch((nextError) => {
				if (activeRequest.current === requestId) {
					setError(errorMessage(nextError));
				}
			})
			.finally(() => {
				if (activeRequest.current === requestId) {
					setLoading(false);
				}
			});
	}, []);

	useEffect(() => {
		activeRequest.current += 1;
		setCourse(undefined);
		setError('');
		setLoading(Boolean(route));
		const previewDelay = window.setTimeout(() => load(route), 250);
		return () => {
			window.clearTimeout(previewDelay);
			activeRequest.current += 1;
		};
	}, [load, route]);

	return { course, error, loading, retry: () => load(route, false) };
}

function importButtonLabel(alreadyImported: boolean, importing: boolean): string {
	if (alreadyImported) {
		return 'Already imported';
	}
	return importing ? 'Importing…' : 'Import route';
}

function RoutePreviewDetails({
	alreadyImported,
	analysis,
	course,
	importError,
	importing,
	onImport,
	route,
	speedUnit,
}: {
	alreadyImported: boolean;
	analysis?: BikeGpxRouteAnalysis;
	course?: WorkoutCourse;
	importError: string;
	importing: boolean;
	onImport: () => void;
	route: BikeGpxRouteSummary;
	speedUnit: SpeedUnit;
}) {
	const location = bikeGpxRouteLocation(route);
	return (
		<div className="absolute bottom-3 left-3 z-500 w-[calc(100%-1.5rem)] max-w-md rounded-lg border border-slate-600/50 bg-[#10151a]/88 p-3 shadow-black/30 shadow-lg backdrop-blur-sm">
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<h3 className="truncate font-bold text-sm">{route.name}</h3>
					<p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400 leading-relaxed">
						{route.country}
						{location ? ` · ${location}` : ''}
					</p>
					<p className="mt-1 text-[11px] text-slate-300 tabular-nums">
						{formatBikeGpxRouteStats(route, analysis, speedUnit)}
					</p>
					<div className="mt-1 text-[10px]">
						<a
							className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
							href={bikeGpxRouteUrl(route.id)}
							rel="noreferrer"
							target="_blank"
						>
							View source route
						</a>
						{importError ? (
							<span
								aria-live="assertive"
								className="mt-1 block text-rose-300 leading-relaxed"
								role="alert"
							>
								{importError}
							</span>
						) : null}
					</div>
				</div>
				<button
					className="h-8 shrink-0 rounded-md border border-cyan-300/30 bg-cyan-400/8 px-3 font-semibold text-[11px] text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={!course || importing || alreadyImported}
					onClick={onImport}
					type="button"
				>
					{importButtonLabel(alreadyImported, importing)}
				</button>
			</div>
			{course ? (
				<div className="mt-2 border-slate-600/40 border-t pt-2">
					<WorkoutRouteVisualization
						className="h-14"
						course={course}
						view={WORKOUT_VIEW.PROFILE}
					/>
				</div>
			) : null}
		</div>
	);
}

function RoutePreview({
	analysis,
	customCourseIds,
	onImportCourse,
	route,
	speedUnit,
}: {
	analysis?: BikeGpxRouteAnalysis;
	customCourseIds: ReadonlySet<string>;
	onImportCourse: (course: WorkoutCourse) => Promise<WorkoutCourse>;
	route?: BikeGpxRouteSummary;
	speedUnit: SpeedUnit;
}) {
	const preview = useRoutePreview(route);
	const [feedback, setFeedback] = useState({ error: '', routeId: '' });
	const [importing, setImporting] = useState(false);
	const alreadyImported = preview.course ? customCourseIds.has(preview.course.id) : false;
	const visibleFeedback = route?.id === feedback.routeId ? feedback : undefined;

	const importRoute = async () => {
		if (!(preview.course && route)) {
			return;
		}
		setFeedback({ error: '', routeId: route.id });
		setImporting(true);
		try {
			await onImportCourse(preview.course);
		} catch (error) {
			setFeedback({ error: errorMessage(error), routeId: route.id });
		} finally {
			setImporting(false);
		}
	};

	return (
		<div className="relative flex min-h-96 min-w-0 flex-1 flex-col bg-[#0e141a]">
			{preview.course ? <WorkoutRouteMap course={preview.course} /> : null}
			{preview.loading ? (
				<div
					className="absolute inset-0 grid place-items-center text-slate-400 text-sm"
					role="status"
				>
					Loading route…
				</div>
			) : null}
			{preview.error ? (
				<div className="absolute inset-0 grid place-items-center px-8 text-center">
					<div>
						<p className="text-rose-300 text-sm">{preview.error}</p>
						<button
							className="mt-3 font-semibold text-cyan-400 text-xs hover:text-cyan-200"
							onClick={preview.retry}
							type="button"
						>
							Try again
						</button>
					</div>
				</div>
			) : null}
			{route && analysis ? (
				<RoutePreviewDetails
					alreadyImported={alreadyImported}
					analysis={analysis}
					course={preview.course}
					importError={visibleFeedback?.error ?? ''}
					importing={importing}
					onImport={importRoute}
					route={route}
					speedUnit={speedUnit}
				/>
			) : (
				<div className="absolute inset-0 grid place-items-center px-8 text-center text-slate-400 text-sm">
					No prepared route is available for these filters.
				</div>
			)}
		</div>
	);
}

export function BikeGpxBrowserDialog({
	catalog,
	catalogError,
	catalogLoading,
	customCourseIds,
	onClose,
	onImportCourse,
	onRefreshCatalog,
	speedUnit,
}: {
	catalog?: BikeGpxCatalog;
	catalogError: string;
	catalogLoading: boolean;
	customCourseIds: ReadonlySet<string>;
	onClose: () => void;
	onImportCourse: (course: WorkoutCourse) => Promise<WorkoutCourse>;
	onRefreshCatalog: () => Promise<void>;
	speedUnit: SpeedUnit;
}) {
	useCloseOnEscape(true, onClose);
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>();
	const [search, setSearchState] = useState(loadBikeGpxBrowserSearch);
	const setSearch = useCallback((update: (current: typeof search) => typeof search) => {
		setSearchState((current) => {
			const next = update(current);
			persistBikeGpxBrowserSearch(next);
			return next;
		});
	}, []);
	const { country, difficulty, maximumDistance, minimumDistance, query, selectedRouteId } =
		search;
	const deferredQuery = useDeferredValue(query);
	const routes = catalog ? catalog.routes : [];
	const analyses = catalog ? catalog.analyses : EMPTY_ROUTE_ANALYSES;
	const countries = useMemo(
		() => [...new Set(routes.map((route) => route.country))].sort(),
		[routes]
	);
	const filteredRoutes = useMemo(
		() =>
			matchingRoutes(
				routes,
				deferredQuery,
				country,
				difficulty,
				minimumDistance,
				maximumDistance,
				speedUnit,
				analyses
			),
		[
			analyses,
			country,
			deferredQuery,
			difficulty,
			maximumDistance,
			minimumDistance,
			routes,
			speedUnit,
		]
	);
	const selectedRoute = bikeGpxPreviewRoute(filteredRoutes, selectedRouteId);

	const selectRoute = (route: BikeGpxRouteSummary) => {
		setSearch((current) => ({ ...current, selectedRouteId: route.id }));
	};

	return (
		<div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]">
			<button
				aria-label="Dismiss BikeGPX browser"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onClose}
				type="button"
			/>
			<section
				aria-labelledby="bikegpx-browser-title"
				aria-modal="true"
				className="absolute inset-4 z-10 flex flex-col overflow-hidden rounded-2xl border border-slate-600 bg-panel shadow-2xl shadow-black/70 xl:top-6 xl:right-152 xl:bottom-6 xl:left-6"
				role="dialog"
			>
				<header className="flex items-start gap-4 border-line border-b bg-[#12171d] px-5 py-4 sm:px-6">
					<div className="mr-auto min-w-0">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h2 className="font-bold text-xl" id="bikegpx-browser-title">
								<a
									className="underline decoration-cyan-400/50 underline-offset-4 transition hover:text-cyan-300 hover:decoration-cyan-300"
									href={BIKEGPX_ROUTES_URL}
									rel="noreferrer"
									target="_blank"
								>
									Browse BikeGPX routes
								</a>
							</h2>
							{catalog ? (
								<span className="font-bold text-cyan-300 text-sm tabular-nums">
									{filteredRoutes.length.toLocaleString()} routes
								</span>
							) : null}
						</div>
						<p className="mt-1 text-slate-400 text-xs leading-relaxed">
							Search thousands of public routes, preview the complete course, then
							import it directly into Ride Control. Thanks to BikeGPX for making this
							public route data available.
						</p>
					</div>
					<button
						aria-label="Close BikeGPX browser"
						className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						ref={closeButtonRef}
						type="button"
					>
						×
					</button>
				</header>
				<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
					<RouteSidebar
						analyses={analyses}
						catalog={catalog}
						catalogError={catalogError}
						catalogLoading={catalogLoading}
						countries={countries}
						country={country}
						difficulty={difficulty}
						maximumDistance={maximumDistance}
						minimumDistance={minimumDistance}
						onCountryChange={(nextCountry) => {
							setSearch((current) => ({
								...current,
								country: nextCountry,
								selectedRouteId: '',
							}));
						}}
						onDifficultyChange={(nextDifficulty) => {
							setSearch((current) => ({
								...current,
								difficulty: nextDifficulty,
								selectedRouteId: '',
							}));
						}}
						onMaximumDistanceChange={(nextDistance) => {
							setSearch((current) => ({
								...current,
								maximumDistance: nextDistance,
								selectedRouteId: '',
							}));
						}}
						onMinimumDistanceChange={(nextDistance) => {
							setSearch((current) => ({
								...current,
								minimumDistance: nextDistance,
								selectedRouteId: '',
							}));
						}}
						onQueryChange={(nextQuery) => {
							setSearch((current) => ({
								...current,
								query: nextQuery,
								selectedRouteId: '',
							}));
						}}
						onRefreshCatalog={onRefreshCatalog}
						onSelectRoute={selectRoute}
						query={query}
						routes={filteredRoutes}
						selectedRouteId={selectedRoute ? selectedRoute.id : ''}
						speedUnit={speedUnit}
					/>
					<RoutePreview
						analysis={selectedRoute ? analyses[selectedRoute.id] : undefined}
						customCourseIds={customCourseIds}
						onImportCourse={onImportCourse}
						route={selectedRoute}
						speedUnit={speedUnit}
					/>
				</div>
			</section>
		</div>
	);
}
