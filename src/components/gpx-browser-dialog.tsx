import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { useGpxCatalog, useGpxProviders } from '../hooks/use-gpx-catalog';
import { usePersistentScrollPosition } from '../hooks/use-persistent-scroll-position';
import { errorMessage } from '../lib/errors';
import { matchingGpxRoutes } from '../lib/gpx-browser-form';
import {
	gpxRouteListScrollPositionStorageKey,
	initialGpxBrowserSearch,
	persistGpxBrowserSearch,
	type ReportedGpxRouteId,
	reconcileGpxBrowserRoute,
} from '../lib/gpx-browser-preferences';
import {
	fetchGpxRoute,
	formatGpxRouteStats,
	type GpxCatalog,
	type GpxRouteAnalysis,
	type GpxRouteResult,
	type GpxRouteSummary,
	gpxPreviewRoute,
	gpxRouteAssetUrl,
	gpxRouteKey,
} from '../lib/gpx-provider';
import { distanceUnitLabel } from '../lib/units';
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
const EMPTY_ROUTE_ANALYSES: Record<string, GpxRouteAnalysis> = {};
const routeResultCache = new Map<string, GpxRouteResult>();
const routeResultRequests = new Map<string, Promise<GpxRouteResult>>();

function requestRouteCourse(route: GpxRouteSummary, useCache = true): Promise<GpxRouteResult> {
	const key = gpxRouteKey(route);
	if (!useCache) {
		routeResultCache.delete(key);
	}
	const cached = useCache ? routeResultCache.get(key) : undefined;
	if (cached) {
		return Promise.resolve(cached);
	}
	const pending = routeResultRequests.get(key);
	if (pending) {
		return pending;
	}
	const request = fetchGpxRoute(route)
		.then((result) => {
			routeResultCache.set(key, result);
			return result;
		})
		.finally(() => {
			routeResultRequests.delete(key);
		});
	routeResultRequests.set(key, request);
	return request;
}

function RouteListItem({
	analysis,
	onSelect,
	route,
	selected,
	speedUnit,
}: {
	analysis: GpxRouteAnalysis;
	onSelect: () => void;
	route: GpxRouteSummary;
	selected: boolean;
	speedUnit: SpeedUnit;
}) {
	const difficulty = workoutDifficultyLabel(analysis.difficulty);
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
				<span className="truncate text-slate-500">{route.group}</span>
				<span
					className="shrink-0 rounded-full border border-violet-400/25 bg-violet-400/5 px-1.5 py-0.5 font-semibold text-[9px] text-violet-300 uppercase tracking-wide"
					title="Difficulty calculated from distance, climbing, and maximum grade"
				>
					{difficulty}
				</span>
			</span>
			{route.location ? (
				<span className="mt-1 block text-[11px] text-slate-400 leading-relaxed">
					{route.location}
				</span>
			) : null}
			<span className="mt-1 block text-[11px] text-slate-300 tabular-nums">
				{formatGpxRouteStats(route, analysis, speedUnit)}
			</span>
		</button>
	);
}

function RouteSidebar({
	analyses,
	catalog,
	catalogError,
	catalogLoading,
	group,
	groups,
	difficulty,
	maximumDistance,
	minimumDistance,
	onGroupChange,
	onDifficultyChange,
	onMaximumDistanceChange,
	onMinimumDistanceChange,
	onQueryChange,
	onRefreshCatalog,
	onSelectRoute,
	query,
	routes,
	selectedRouteId,
	scrollStorageKey,
	speedUnit,
}: {
	analyses: Record<string, GpxRouteAnalysis>;
	catalog?: GpxCatalog;
	catalogError: string;
	catalogLoading: boolean;
	group: string;
	groups: string[];
	difficulty?: WorkoutDifficulty;
	maximumDistance: string;
	minimumDistance: string;
	onGroupChange: (group: string) => void;
	onDifficultyChange: (difficulty: WorkoutDifficulty | undefined) => void;
	onMaximumDistanceChange: (distance: string) => void;
	onMinimumDistanceChange: (distance: string) => void;
	onQueryChange: (query: string) => void;
	onRefreshCatalog: () => Promise<void>;
	onSelectRoute: (route: GpxRouteSummary) => void;
	query: string;
	routes: GpxRouteSummary[];
	selectedRouteId: string;
	scrollStorageKey: string;
	speedUnit: SpeedUnit;
}) {
	const routeListRef = useRef<HTMLDivElement>(null);
	const routeListScroll = usePersistentScrollPosition<HTMLDivElement>(
		scrollStorageKey,
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
				<label className="sr-only" htmlFor="gpx-search">
					Search GPX routes
				</label>
				<input
					className="h-10 w-full rounded-lg border border-line bg-[#12171d] px-3 text-slate-100 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10"
					id="gpx-search"
					onChange={(event) => onQueryChange(event.currentTarget.value)}
					placeholder="Name, place, distance, or difficulty"
					type="search"
					value={query}
				/>
				<div className="grid grid-cols-2 gap-2">
					<label className="sr-only" htmlFor="gpx-group">
						Filter GPX routes by group
					</label>
					<select
						className="h-9 min-w-0 rounded-lg border border-line bg-[#12171d] px-2 text-slate-300 text-xs outline-none focus:border-cyan-400/70"
						id="gpx-group"
						onChange={(event) => onGroupChange(event.currentTarget.value)}
						value={group}
					>
						<option value="">All groups</option>
						{groups.map((groupName) => (
							<option key={groupName} value={groupName}>
								{groupName}
							</option>
						))}
					</select>
					<label className="sr-only" htmlFor="gpx-difficulty">
						Filter GPX routes by estimated difficulty
					</label>
					<select
						className="h-9 min-w-0 rounded-lg border border-line bg-[#12171d] px-2 text-slate-300 text-xs outline-none focus:border-cyan-400/70"
						id="gpx-difficulty"
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
					<label className="sr-only" htmlFor="gpx-minimum-distance">
						Minimum route distance in {distanceUnit}
					</label>
					<input
						className="h-9 min-w-0 rounded-lg border border-line bg-[#12171d] px-2 text-slate-200 text-xs outline-none placeholder:text-slate-600 focus:border-cyan-400/70"
						id="gpx-minimum-distance"
						min="0"
						onChange={(event) => onMinimumDistanceChange(event.currentTarget.value)}
						placeholder={`Min ${distanceUnit}`}
						step="1"
						type="number"
						value={minimumDistance}
					/>
					<label className="sr-only" htmlFor="gpx-maximum-distance">
						Maximum route distance in {distanceUnit}
					</label>
					<input
						className="h-9 min-w-0 rounded-lg border border-line bg-[#12171d] px-2 text-slate-200 text-xs outline-none placeholder:text-slate-600 focus:border-cyan-400/70"
						id="gpx-maximum-distance"
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
				data-testid="gpx-route-list"
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
						Loading GPX routes…
					</p>
				) : null}
				{!catalogLoading && routes.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm">
						<p className="text-slate-400">
							{catalogError || 'No GPX routes match these filters.'}
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

function useRoutePreview(route: GpxRouteSummary | undefined) {
	const activeRequest = useRef(0);
	const [course, setCourse] = useState<WorkoutCourse>();
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const load = useCallback((nextRoute: GpxRouteSummary | undefined, useCache = true) => {
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
	analysis?: GpxRouteAnalysis;
	course?: WorkoutCourse;
	importError: string;
	importing: boolean;
	onImport: () => void;
	route: GpxRouteSummary;
	speedUnit: SpeedUnit;
}) {
	return (
		<div className="absolute bottom-3 left-3 z-500 w-[calc(100%-1.5rem)] max-w-md rounded-lg border border-slate-600/50 bg-[#10151a]/88 p-3 shadow-black/30 shadow-lg backdrop-blur-sm">
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<h3 className="truncate font-bold text-sm">{route.name}</h3>
					<p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400 leading-relaxed">
						{route.group}
						{route.location ? ` · ${route.location}` : ''}
					</p>
					<p className="mt-1 text-[11px] text-slate-300 tabular-nums">
						{formatGpxRouteStats(route, analysis, speedUnit)}
					</p>
					<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
						<a
							className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
							href={route.sourceUrl}
							rel="noreferrer"
							target="_blank"
						>
							View source route
						</a>
						<a
							className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
							download
							href={gpxRouteAssetUrl(route, 'gpx')}
						>
							Download GPX
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
	analysis?: GpxRouteAnalysis;
	customCourseIds: ReadonlySet<string>;
	onImportCourse: (course: WorkoutCourse) => Promise<WorkoutCourse>;
	route?: GpxRouteSummary;
	speedUnit: SpeedUnit;
}) {
	const preview = useRoutePreview(route);
	const [feedback, setFeedback] = useState({ error: '', routeId: '' });
	const [importing, setImporting] = useState(false);
	const alreadyImported = preview.course ? customCourseIds.has(preview.course.id) : false;
	const visibleFeedback = route && gpxRouteKey(route) === feedback.routeId ? feedback : undefined;

	const importRoute = async () => {
		if (!(preview.course && route)) {
			return;
		}
		setFeedback({ error: '', routeId: gpxRouteKey(route) });
		setImporting(true);
		try {
			await onImportCourse(preview.course);
		} catch (error) {
			setFeedback({ error: errorMessage(error), routeId: gpxRouteKey(route) });
		} finally {
			setImporting(false);
		}
	};

	return (
		<div className="relative flex min-h-96 min-w-0 flex-1 flex-col bg-[#0e141a]">
			{preview.course ? <WorkoutRouteMap course={preview.course} /> : null}
			{route?.image ? (
				<figure className="absolute top-3 right-3 z-400 hidden max-w-72 overflow-hidden rounded-lg border border-slate-600/50 bg-[#10151a]/92 shadow-black/30 shadow-lg sm:block">
					<img
						alt={route.image.alt}
						className="h-28 w-full object-cover"
						height="112"
						src={route.image.url}
						width="288"
					/>
					{route.image.attribution ? (
						<figcaption className="px-2 py-1 text-[9px] text-slate-500">
							Image: {route.image.attribution}
						</figcaption>
					) : null}
				</figure>
			) : null}
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

export interface GpxBrowserSelection {
	collectionId: string;
	providerId: string;
	routeId?: string;
}

export function GpxBrowserDialog({
	customCourseIds,
	onClose,
	onImportCourse,
	onSelectRoute,
	requestedCollectionId,
	requestedProviderId,
	requestedRouteId,
	speedUnit,
}: {
	customCourseIds: ReadonlySet<string>;
	onClose: () => void;
	onImportCourse: (course: WorkoutCourse) => Promise<WorkoutCourse>;
	onSelectRoute?: (selection: GpxBrowserSelection) => void;
	requestedCollectionId?: string;
	requestedProviderId?: string;
	requestedRouteId?: string;
	speedUnit: SpeedUnit;
}) {
	useCloseOnEscape(true, onClose);
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>();
	const reportedRouteId = useRef<ReportedGpxRouteId>(undefined);
	const [search, setSearchState] = useState(() =>
		initialGpxBrowserSearch({
			collectionId: requestedCollectionId,
			providerId: requestedProviderId,
			routeId: requestedRouteId,
		})
	);
	const setSearch = useCallback((update: (current: typeof search) => typeof search) => {
		setSearchState((current) => {
			const next = update(current);
			persistGpxBrowserSearch(next);
			return next;
		});
	}, []);
	const {
		collectionId,
		difficulty,
		group,
		maximumDistance,
		minimumDistance,
		providerId,
		query,
		selectedRouteId,
	} = search;
	const providersRequest = useGpxProviders(true);
	const providers = providersRequest.providers ?? [];
	const selectedProvider = providers.find((provider) => provider.id === providerId);
	const selectedCollection = selectedProvider?.collections.find(
		(collection) => collection.id === collectionId
	);
	const catalogRequest = useGpxCatalog(true, providerId, collectionId);
	const { catalog } = catalogRequest;
	const routes = catalog ? catalog.routes : [];
	const analyses = catalog ? catalog.analyses : EMPTY_ROUTE_ANALYSES;
	const groups = useMemo(() => [...new Set(routes.map((route) => route.group))].sort(), [routes]);
	const filteredRoutes = useMemo(
		() =>
			matchingGpxRoutes(
				routes,
				{
					difficulty,
					group,
					maximumDistance,
					minimumDistance,
					query,
				},
				speedUnit,
				analyses
			),
		[analyses, difficulty, group, maximumDistance, minimumDistance, query, routes, speedUnit]
	);
	const selectedRoute = gpxPreviewRoute(filteredRoutes, selectedRouteId);

	useEffect(() => {
		if (providers.length === 0) {
			return;
		}
		const provider = providers.find((candidate) => candidate.id === providerId) ?? providers[0];
		const collection =
			provider.collections.find((candidate) => candidate.id === collectionId) ??
			provider.collections[0];
		if (collection && (provider.id !== providerId || collection.id !== collectionId)) {
			const next = {
				...search,
				collectionId: collection.id,
				group: '',
				providerId: provider.id,
				selectedRouteId: '',
			};
			setSearchState(next);
			persistGpxBrowserSearch(next);
			onSelectRoute?.({ collectionId: collection.id, providerId: provider.id });
		}
	}, [collectionId, onSelectRoute, providerId, providers, search]);

	useEffect(() => {
		if (
			!(
				requestedProviderId &&
				requestedCollectionId &&
				(requestedProviderId !== providerId || requestedCollectionId !== collectionId)
			)
		) {
			return;
		}
		const next = initialGpxBrowserSearch({
			collectionId: requestedCollectionId,
			providerId: requestedProviderId,
			routeId: requestedRouteId,
		});
		setSearchState(next);
		persistGpxBrowserSearch(next);
		reportedRouteId.current = undefined;
	}, [collectionId, providerId, requestedCollectionId, requestedProviderId, requestedRouteId]);

	useEffect(() => {
		const reconciliation = reconcileGpxBrowserRoute(
			search,
			requestedRouteId,
			reportedRouteId.current
		);
		reportedRouteId.current = reconciliation.reportedRouteId;
		if (reconciliation.search === search) {
			return;
		}
		setSearchState(reconciliation.search);
		persistGpxBrowserSearch(reconciliation.search);
	}, [requestedRouteId, search]);
	const reportSelectedRoute = useCallback(
		(routeId: string | undefined) => {
			reportedRouteId.current = routeId ?? null;
			onSelectRoute?.({ collectionId, providerId, ...(routeId ? { routeId } : {}) });
		},
		[collectionId, onSelectRoute, providerId]
	);
	useEffect(() => {
		if (
			reportedRouteId.current === undefined &&
			!(requestedRouteId && requestedRouteId !== selectedRouteId) &&
			selectedRoute &&
			selectedRoute.id !== requestedRouteId
		) {
			reportSelectedRoute(selectedRoute.id);
		}
	}, [reportSelectedRoute, requestedRouteId, selectedRoute, selectedRouteId]);

	const selectRoute = (route: GpxRouteSummary) => {
		setSearch((current) => ({ ...current, selectedRouteId: route.id }));
		reportSelectedRoute(route.id);
	};
	const clearSelectedRoute = () => reportSelectedRoute(undefined);
	const changeProvider = (nextProviderId: string) => {
		const provider = providers.find((candidate) => candidate.id === nextProviderId);
		const nextCollection = provider?.collections[0];
		if (!nextCollection) {
			return;
		}
		setSearch((current) => ({
			...current,
			collectionId: nextCollection.id,
			group: '',
			providerId: nextProviderId,
			selectedRouteId: '',
		}));
		onSelectRoute?.({ collectionId: nextCollection.id, providerId: nextProviderId });
	};
	const changeCollection = (nextCollectionId: string) => {
		setSearch((current) => ({
			...current,
			collectionId: nextCollectionId,
			group: '',
			selectedRouteId: '',
		}));
		onSelectRoute?.({ collectionId: nextCollectionId, providerId });
	};
	const catalogError = providersRequest.error || catalogRequest.error;
	const catalogLoading = providersRequest.loading || catalogRequest.loading;

	return (
		<div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]">
			<button
				aria-label="Dismiss GPX browser"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onClose}
				type="button"
			/>
			<section
				aria-labelledby="gpx-browser-title"
				aria-modal="true"
				className="absolute inset-4 z-10 flex flex-col overflow-hidden rounded-2xl border border-slate-600 bg-panel shadow-2xl shadow-black/70 xl:top-6 xl:right-152 xl:bottom-6 xl:left-6"
				role="dialog"
			>
				<header className="flex items-start gap-4 border-line border-b bg-[#12171d] px-5 py-4 sm:px-6">
					<div className="mr-auto min-w-0">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h2 className="font-bold text-xl" id="gpx-browser-title">
								<a
									className="underline decoration-cyan-400/50 underline-offset-4 transition hover:text-cyan-300 hover:decoration-cyan-300"
									href={
										selectedCollection?.sourceUrl ?? selectedProvider?.sourceUrl
									}
									rel="noreferrer"
									target="_blank"
								>
									Browse {selectedCollection?.name ?? 'GPX routes'}
								</a>
							</h2>
							{catalog ? (
								<span className="font-bold text-cyan-300 text-sm tabular-nums">
									{filteredRoutes.length.toLocaleString()} routes
								</span>
							) : null}
						</div>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<label className="sr-only" htmlFor="gpx-provider">
								Route provider
							</label>
							<select
								className="h-8 rounded-lg border border-line bg-[#0e141a] px-2 text-slate-200 text-xs outline-none focus:border-cyan-400/70"
								id="gpx-provider"
								onChange={(event) => changeProvider(event.currentTarget.value)}
								value={providerId}
							>
								{providers.map((provider) => (
									<option key={provider.id} value={provider.id}>
										{provider.name}
									</option>
								))}
							</select>
							<label className="sr-only" htmlFor="gpx-collection">
								Route collection
							</label>
							<select
								className="h-8 rounded-lg border border-line bg-[#0e141a] px-2 text-slate-200 text-xs outline-none focus:border-cyan-400/70"
								id="gpx-collection"
								onChange={(event) => changeCollection(event.currentTarget.value)}
								value={collectionId}
							>
								{selectedProvider?.collections.map((collection) => {
									const routeCount =
										catalog?.provider.id === collection.providerId &&
										catalog.collection.id === collection.id
											? catalog.routes.length
											: collection.routeCount;
									return (
										<option key={collection.id} value={collection.id}>
											{collection.name} ({routeCount.toLocaleString()})
										</option>
									);
								})}
							</select>
							<p className="text-slate-500 text-xs">
								{selectedCollection?.description ??
									'Choose a provider and route collection.'}
							</p>
						</div>
					</div>
					<button
						aria-label="Close GPX browser"
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
						difficulty={difficulty}
						group={group}
						groups={groups}
						maximumDistance={maximumDistance}
						minimumDistance={minimumDistance}
						onDifficultyChange={(nextDifficulty) => {
							setSearch((current) => ({
								...current,
								difficulty: nextDifficulty,
								selectedRouteId: '',
							}));
							clearSelectedRoute();
						}}
						onGroupChange={(nextGroup) => {
							setSearch((current) => ({
								...current,
								group: nextGroup,
								selectedRouteId: '',
							}));
							clearSelectedRoute();
						}}
						onMaximumDistanceChange={(nextDistance) => {
							setSearch((current) => ({
								...current,
								maximumDistance: nextDistance,
								selectedRouteId: '',
							}));
							clearSelectedRoute();
						}}
						onMinimumDistanceChange={(nextDistance) => {
							setSearch((current) => ({
								...current,
								minimumDistance: nextDistance,
								selectedRouteId: '',
							}));
							clearSelectedRoute();
						}}
						onQueryChange={(nextQuery) => {
							setSearch((current) => ({
								...current,
								query: nextQuery,
								selectedRouteId: '',
							}));
							clearSelectedRoute();
						}}
						onRefreshCatalog={catalogRequest.refresh}
						onSelectRoute={selectRoute}
						query={query}
						routes={filteredRoutes}
						scrollStorageKey={gpxRouteListScrollPositionStorageKey(
							providerId,
							collectionId
						)}
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
