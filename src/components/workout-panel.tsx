import {
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DraggableAttributes,
	type DraggableSyntheticListeners,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
	type CSSProperties,
	Fragment,
	type KeyboardEvent,
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useFileDrop } from '../hooks/use-file-drop';
import { usePersistentScrollPosition } from '../hooks/use-persistent-scroll-position';
import { APP_OVERLAY } from '../lib/app-overlay';
import { errorMessage } from '../lib/errors';
import { descriptionWithoutDistance, formatDistance, formatElevation } from '../lib/units';
import {
	OPENSTREETMAP_ATTRIBUTION_URL,
	WORKOUT_DESCRIPTION_ATTRIBUTION,
} from '../lib/workout-description';
import { canMoveWorkoutCourse, downloadWorkoutFile } from '../lib/workout-file';
import { workoutMaximumGrade } from '../lib/workout-metrics';
import { WORKOUT_VIEW, workoutRouteLabel } from '../lib/workout-schema';
import { workoutDifficultyLabel, workoutMatchesSearch } from '../lib/workouts';
import type { SpeedUnit, WorkoutCourse } from '../types';
import type { GpxBrowserSelection } from './gpx-browser-dialog';
import { Icon } from './icon';
import { RenameWorkoutDialog } from './rename-workout-dialog';
import { SideTray } from './side-tray';
import { WorkoutRouteVisualization } from './workout-route-visualization';

const REORDER_KEY = {
	EARLIER: 'ArrowUp',
	LATER: 'ArrowDown',
} as const;
const WORKOUT_SCROLL_POSITION_STORAGE_KEY = 'ride-control-workout-scroll-position';
const WorkoutMapDialog = lazy(async () => {
	const module = await import('./workout-map-dialog');
	return { default: module.WorkoutMapDialog };
});
const GpxBrowserDialog = lazy(async () => {
	const module = await import('./gpx-browser-dialog');
	return { default: module.GpxBrowserDialog };
});

const workoutCollisionDetection: CollisionDetection = (args) => {
	const pointerCollisions = pointerWithin(args);
	return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

function WorkoutCourseCard({
	course,
	custom,
	disabled,
	dragHandleAttributes,
	dragHandleListeners,
	dragged,
	focused,
	onFocus,
	onMove,
	onRemove,
	onRename,
	onSelect,
	onViewMap,
	setDragHandleRef,
	setNodeRef,
	selected,
	speedUnit,
	style,
}: {
	course: WorkoutCourse;
	custom: boolean;
	disabled: boolean;
	dragHandleAttributes: DraggableAttributes;
	dragHandleListeners: DraggableSyntheticListeners;
	dragged: boolean;
	focused: boolean;
	onFocus: () => void;
	onMove: (direction: -1 | 1) => void;
	onRemove: () => void;
	onRename: () => void;
	onSelect: () => void;
	onViewMap: () => void;
	setDragHandleRef: (node: HTMLElement | null) => void;
	setNodeRef: (node: HTMLElement | null) => void;
	selected: boolean;
	speedUnit: SpeedUnit;
	style?: CSSProperties;
}) {
	const usesOpenStreetMapAttribution =
		course.descriptionAttribution === WORKOUT_DESCRIPTION_ATTRIBUTION.OPENSTREETMAP;
	const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === REORDER_KEY.EARLIER) {
			event.preventDefault();
			onMove(-1);
		} else if (event.key === REORDER_KEY.LATER) {
			event.preventDefault();
			onMove(1);
		}
	};
	let emphasis = 'border-line';
	if (selected) {
		emphasis = 'border-mint/50 shadow-[0_0_20px_rgba(173,245,189,.08)]';
	} else if (focused) {
		emphasis = 'border-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,.08)]';
	}

	return (
		<article
			className={`relative overflow-hidden rounded-2xl border bg-[#12171d] transition-colors ${emphasis} ${dragged ? 'cursor-grabbing opacity-95 shadow-[0_20px_50px_rgba(0,0,0,.5)]' : ''}`}
			data-focused={focused ? 'true' : undefined}
			id={`workout-${encodeURIComponent(course.id)}`}
			onClickCapture={onFocus}
			ref={setNodeRef}
			style={style}
		>
			<button
				{...dragHandleAttributes}
				{...dragHandleListeners}
				aria-label={`Drag ${course.name} to reorder`}
				className="absolute top-3 right-3 z-10 grid cursor-grab touch-none place-items-center rounded-lg border border-slate-600 bg-[#12171d]/95 p-2 text-slate-400 shadow-lg transition hover:border-cyan-400/70 hover:text-cyan-300 active:cursor-grabbing"
				onKeyDown={moveWithKeyboard}
				ref={setDragHandleRef}
				title="Drag to reorder. Use the up and down arrow keys while focused."
				type="button"
			>
				<Icon className="h-4 w-4" name="move-vertical" title="Move workout up or down" />
			</button>
			<div className="grid grid-cols-2 gap-px bg-line">
				<div className="bg-[#10151a] px-4 py-2">
					<WorkoutRouteVisualization
						className="h-24"
						course={course}
						view={WORKOUT_VIEW.MAP}
					/>
				</div>
				<div className="bg-[#10151a] px-4 py-2">
					<WorkoutRouteVisualization
						className="h-24"
						course={course}
						view={WORKOUT_VIEW.PROFILE}
					/>
				</div>
			</div>
			<div className="p-4">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h3 className="font-bold text-base">
							{custom ? (
								<button
									aria-label={`Rename ${course.name}`}
									className="text-left underline decoration-cyan-400/40 underline-offset-4 transition hover:text-cyan-300 hover:decoration-cyan-300"
									onClick={onRename}
									title="Rename imported workout"
									type="button"
								>
									{course.name}
								</button>
							) : (
								course.name
							)}
						</h3>
						<p className="mt-1 text-slate-400 text-xs leading-relaxed">
							{usesOpenStreetMapAttribution ? (
								<button
									className="underline decoration-cyan-400/40 underline-offset-2 transition hover:text-cyan-300 hover:decoration-cyan-300"
									onClick={onViewMap}
									title="View the route map"
									type="button"
								>
									{descriptionWithoutDistance(course.description)}
								</button>
							) : (
								descriptionWithoutDistance(course.description)
							)}
						</p>
					</div>
					<div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
						{custom ? (
							<span className="rounded-full border border-cyan-400/30 bg-cyan-400/5 px-2 py-1 font-bold text-[9px] text-cyan-300 uppercase tracking-wide">
								Imported
							</span>
						) : null}
						<span className="rounded-full border border-slate-700 px-2 py-1 font-bold text-[9px] text-slate-400 uppercase tracking-wide">
							{workoutDifficultyLabel(course.difficulty)}
						</span>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-slate-500 text-xs tabular-nums">
					<span>
						{formatDistance(course.distance, speedUnit, 1)}{' '}
						{workoutRouteLabel(course.routeType)}
					</span>
					<span>{formatElevation(course.elevationGain, speedUnit)} climbing</span>
					<span>Up to +{workoutMaximumGrade(course).toFixed(1)}%</span>
					<div
						className={`${usesOpenStreetMapAttribution ? 'flex basis-full items-center gap-3 pt-1' : 'ml-auto'} font-semibold`}
					>
						{usesOpenStreetMapAttribution ? (
							<a
								className="font-normal text-[10px] text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-slate-300"
								href={OPENSTREETMAP_ATTRIBUTION_URL}
								rel="noreferrer"
								target="_blank"
							>
								© OpenStreetMap contributors
							</a>
						) : null}
						<div
							className={`flex items-center gap-3 ${usesOpenStreetMapAttribution ? 'ml-auto' : ''}`}
						>
							<button
								className="text-cyan-400 hover:text-cyan-200"
								onClick={() => downloadWorkoutFile(course)}
								type="button"
							>
								Download GPX
							</button>
							{custom ? (
								<button
									className="text-rose-400 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
									disabled={disabled}
									onClick={onRemove}
									type="button"
								>
									Remove
								</button>
							) : null}
						</div>
					</div>
				</div>
				<button
					className={`mt-4 h-10 w-full rounded-lg border font-bold text-xs transition ${selected ? 'border-mint/30 bg-mint/10 text-mint' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-slate-500 hover:bg-slate-700/70 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}
					disabled={disabled || selected}
					onClick={onSelect}
					type="button"
				>
					{selected ? 'Selected' : 'Choose workout'}
				</button>
			</div>
		</article>
	);
}

function SortableWorkoutCourseCard(
	props: Omit<
		Parameters<typeof WorkoutCourseCard>[0],
		| 'dragHandleAttributes'
		| 'dragHandleListeners'
		| 'dragged'
		| 'setDragHandleRef'
		| 'setNodeRef'
		| 'style'
	>
) {
	const {
		attributes,
		isDragging,
		listeners,
		setActivatorNodeRef,
		setNodeRef,
		transform,
		transition,
	} = useSortable({ id: props.course.id });
	const style: CSSProperties = {
		position: isDragging ? 'relative' : undefined,
		transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
		transition,
		zIndex: isDragging ? 20 : undefined,
	};

	return (
		<WorkoutCourseCard
			{...props}
			dragged={isDragging}
			dragHandleAttributes={attributes}
			dragHandleListeners={listeners}
			setDragHandleRef={setActivatorNodeRef}
			setNodeRef={setNodeRef}
			style={style}
		/>
	);
}

function WorkoutDropBoundary({ index }: { index: number }) {
	return <div aria-hidden="true" className="h-4" data-workout-drop-index={index} />;
}

export function WorkoutPanel({
	activeCourse,
	courses,
	customCourseIds,
	focusedCourseId,
	gpxBrowserOpen = false,
	gpxCollectionId,
	gpxProviderId,
	gpxRouteId,
	onClose,
	onCloseGpx,
	onFocusCourse,
	onImportCourse,
	onImportFile,
	onRemoveCourse,
	onRenameCourse,
	onReorderCourse,
	onOpenGpx,
	onSelectGpxRoute,
	onSelect,
	open,
	selectionLocked,
	speedUnit,
}: {
	activeCourse?: WorkoutCourse;
	courses: WorkoutCourse[];
	customCourseIds: ReadonlySet<string>;
	focusedCourseId?: string;
	gpxBrowserOpen?: boolean;
	gpxCollectionId?: string;
	gpxProviderId?: string;
	gpxRouteId?: string;
	onClose: () => void;
	onCloseGpx?: () => void;
	onFocusCourse?: (courseId: string | undefined) => void;
	onImportCourse: (course: WorkoutCourse) => Promise<WorkoutCourse>;
	onImportFile: (file: File) => Promise<WorkoutCourse>;
	onRemoveCourse: (courseId: string) => void;
	onRenameCourse: (courseId: string, name: string) => WorkoutCourse;
	onReorderCourse: (movedCourseId: string, destinationIndex: number) => void;
	onOpenGpx?: () => void;
	onSelectGpxRoute?: (selection: GpxBrowserSelection) => void;
	onSelect: (course?: WorkoutCourse) => void;
	open: boolean;
	selectionLocked: boolean;
	speedUnit: SpeedUnit;
}) {
	const importInput = useRef<HTMLInputElement>(null);
	const [importing, setImporting] = useState(false);
	const [libraryStatus, setLibraryStatus] = useState('');
	const [importError, setImportError] = useState('');
	const [renamingCourse, setRenamingCourse] = useState<WorkoutCourse>();
	const [mappedCourse, setMappedCourse] = useState<WorkoutCourse>();
	const [searchQuery, setSearchQuery] = useState('');
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 6 },
		})
	);
	const filteredCourses = useMemo(
		() => courses.filter((course) => workoutMatchesSearch(course, searchQuery)),
		[courses, searchQuery]
	);
	const sortableCourseIds = useMemo(
		() => filteredCourses.map((course) => course.id),
		[filteredCourses]
	);
	const workoutListScroll = usePersistentScrollPosition(
		WORKOUT_SCROLL_POSITION_STORAGE_KEY,
		open
	);
	useEffect(() => {
		if (!(open && focusedCourseId)) {
			return;
		}
		const focusedCourse = courses.find((course) => course.id === focusedCourseId);
		if (!focusedCourse) {
			onFocusCourse?.(undefined);
			return;
		}
		const frame = window.requestAnimationFrame(() => {
			document
				.getElementById(`workout-${encodeURIComponent(focusedCourseId)}`)
				?.scrollIntoView({ block: 'center' });
		});
		return () => window.cancelAnimationFrame(frame);
	}, [courses, focusedCourseId, onFocusCourse, open]);

	const importWorkout = useCallback(
		async (file: File) => {
			setImporting(true);
			setLibraryStatus('');
			setImportError('');
			try {
				const course = await onImportFile(file);
				setSearchQuery('');
				workoutListScroll.scrollToTop();
				setLibraryStatus(`${course.name} imported and saved on this device.`);
			} catch (error) {
				setImportError(errorMessage(error));
			} finally {
				setImporting(false);
			}
		},
		[onImportFile, workoutListScroll.scrollToTop]
	);
	const { active: fileDropActive, targetRef: fileDropTarget } = useFileDrop(
		open && !importing,
		importWorkout
	);

	const closePanel = () => {
		setRenamingCourse(undefined);
		setMappedCourse(undefined);
		setSearchQuery('');
		onClose();
	};
	const reorderCourse = (movedCourseId: string, destinationIndex: number) => {
		if (!movedCourseId) {
			return;
		}
		onReorderCourse(movedCourseId, destinationIndex);
		const movedCourse = courses.find((course) => course.id === movedCourseId);
		if (movedCourse) {
			setLibraryStatus(`${movedCourse.name} moved and its position was saved.`);
		}
	};
	const destinationForBoundary = (boundaryIndex: number): number => {
		const nextCourse = filteredCourses[boundaryIndex];
		if (nextCourse) {
			return courses.findIndex((course) => course.id === nextCourse.id);
		}
		const previousCourse = filteredCourses[boundaryIndex - 1];
		return previousCourse
			? courses.findIndex((course) => course.id === previousCourse.id) + 1
			: courses.length;
	};
	const targetBoundaryForDrag = (event: DragEndEvent): number | undefined => {
		const activeCourseId = String(event.active.id);
		const activeCourseIndex = filteredCourses.findIndex(
			(course) => course.id === activeCourseId
		);
		const { over } = event;
		if (activeCourseIndex < 0 || !over) {
			return;
		}
		const overId = String(over.id);
		const overCourseIndex = filteredCourses.findIndex((course) => course.id === overId);
		if (overCourseIndex < 0 || overCourseIndex === activeCourseIndex) {
			return;
		}
		const boundaryIndex =
			activeCourseIndex < overCourseIndex ? overCourseIndex + 1 : overCourseIndex;
		return canMoveWorkoutCourse(courses, activeCourseId, destinationForBoundary(boundaryIndex))
			? boundaryIndex
			: undefined;
	};
	const moveDraggedCourse = (event: DragEndEvent) => {
		const activeCourseId = String(event.active.id);
		const movedCourse = filteredCourses.find((course) => course.id === activeCourseId);
		const boundaryIndex = targetBoundaryForDrag(event);
		if (movedCourse && boundaryIndex !== undefined) {
			reorderCourse(movedCourse.id, destinationForBoundary(boundaryIndex));
		}
	};

	return (
		<>
			<SideTray
				closeLabel="Close terrain workouts"
				closeOnEscape={!(gpxBrowserOpen || mappedCourse || renamingCourse)}
				labelledBy="workout-panel-title"
				onClose={closePanel}
				open={open}
				panelClassName="max-w-xl"
				tray={APP_OVERLAY.WORKOUTS}
			>
				<div
					className="relative flex h-full flex-col"
					data-gpx-drop-target="true"
					ref={fileDropTarget}
				>
					{fileDropActive ? (
						<div
							className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border-2 border-cyan-300 border-dashed bg-[#0b1118]/95 shadow-[0_0_40px_rgba(34,211,238,.16)]"
							role="status"
						>
							<div className="text-center">
								<p className="font-bold text-cyan-200 text-lg">
									Drop GPX to import
								</p>
								<p className="mt-1 text-slate-400 text-xs">
									The workout will be saved on this device.
								</p>
							</div>
						</div>
					) : null}
					<header className="flex items-start justify-between gap-4 border-line border-b px-5 py-4 sm:px-6">
						<div className="min-w-0">
							<h2 className="font-bold text-xl" id="workout-panel-title">
								Terrain workouts
							</h2>
							<p className="mt-1 max-w-60 text-slate-400 text-sm leading-snug">
								Resistance follows the climbs and descents while your position moves
								along the route.
							</p>
						</div>
						<div className="flex shrink-0 flex-col items-end gap-1.5">
							<div className="flex items-center gap-1.5">
								<input
									accept=".gpx,application/gpx+xml,application/xml,text/xml"
									className="hidden"
									onChange={(event) => {
										const file = event.currentTarget.files?.[0];
										event.currentTarget.value = '';
										if (file) {
											importWorkout(file);
										}
									}}
									ref={importInput}
									type="file"
								/>
								<button
									className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white"
									onClick={onOpenGpx}
									type="button"
								>
									Browse routes
								</button>
								<button
									className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white disabled:cursor-wait disabled:opacity-60"
									disabled={importing}
									onClick={() => importInput.current?.click()}
									type="button"
								>
									{importing ? 'Importing…' : 'Import GPX'}
								</button>
								<button
									aria-label="Close terrain workouts"
									className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white"
									onClick={closePanel}
									type="button"
								>
									×
								</button>
							</div>
							<p className="max-w-64 text-right text-[11px] text-slate-500 leading-snug">
								Browse public route collections or drop a GPX anywhere in this tray.
							</p>
						</div>
					</header>
					<div className="border-line border-b bg-[#10151a] px-5 py-3 text-xs leading-relaxed sm:px-6">
						<div className="flex items-center gap-2">
							<label className="sr-only" htmlFor="workout-search">
								Search workouts by name or difficulty
							</label>
							<input
								className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-[#12171d] px-3 text-slate-100 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10"
								id="workout-search"
								onChange={(event) => setSearchQuery(event.currentTarget.value)}
								placeholder="Search by name or difficulty"
								type="search"
								value={searchQuery}
							/>
							{searchQuery ? (
								<button
									className="h-10 rounded-lg border border-line px-3 font-semibold text-slate-400 hover:border-slate-500 hover:text-white"
									onClick={() => setSearchQuery('')}
									type="button"
								>
									Clear
								</button>
							) : null}
						</div>
					</div>
					<DndContext
						collisionDetection={workoutCollisionDetection}
						modifiers={[restrictToVerticalAxis, restrictToParentElement]}
						onDragEnd={moveDraggedCourse}
						sensors={sensors}
					>
						<div
							className="flex-1 overflow-y-auto px-5 py-3 sm:px-6"
							data-testid="workout-list"
							onScroll={workoutListScroll.onScroll}
							ref={workoutListScroll.ref}
						>
							<SortableContext
								items={sortableCourseIds}
								strategy={verticalListSortingStrategy}
							>
								{filteredCourses.map((course, index) => (
									<Fragment key={course.id}>
										<WorkoutDropBoundary index={index} />
										<SortableWorkoutCourseCard
											course={course}
											custom={customCourseIds.has(course.id)}
											disabled={selectionLocked}
											focused={focusedCourseId === course.id}
											onFocus={() => onFocusCourse?.(course.id)}
											onMove={(direction) => {
												const target = filteredCourses[index + direction];
												if (target) {
													const targetIndex = courses.findIndex(
														(candidate) => candidate.id === target.id
													);
													reorderCourse(
														course.id,
														direction < 0
															? targetIndex
															: targetIndex + 1
													);
												}
											}}
											onRemove={() => onRemoveCourse(course.id)}
											onRename={() => setRenamingCourse(course)}
											onSelect={() => onSelect(course)}
											onViewMap={() => setMappedCourse(course)}
											selected={activeCourse?.id === course.id}
											speedUnit={speedUnit}
										/>
									</Fragment>
								))}
								{filteredCourses.length > 0 ? (
									<WorkoutDropBoundary index={filteredCourses.length} />
								) : null}
							</SortableContext>
							{filteredCourses.length === 0 ? (
								<p
									className="py-10 text-center text-slate-500 text-sm"
									role="status"
								>
									No workouts match “{searchQuery.trim()}”.
								</p>
							) : null}
						</div>
					</DndContext>
					<footer className="flex items-center gap-3 border-line border-t p-4 sm:px-6">
						<div
							aria-live={importError ? 'assertive' : 'polite'}
							className={`flex min-h-9 flex-1 items-center rounded-lg border border-line bg-[#10151a] px-3 text-xs ${importError ? 'text-rose-300' : 'text-cyan-300'}`}
							data-testid="workout-status"
							role={importError ? 'alert' : 'status'}
						>
							{importError || libraryStatus}
						</div>
						{activeCourse && !selectionLocked ? (
							<button
								className="min-h-9 shrink-0 rounded-lg border border-line px-3 py-2 font-semibold text-slate-400 text-xs hover:border-slate-500 hover:text-white"
								onClick={() => onSelect(undefined)}
								type="button"
							>
								Clear selected workout
							</button>
						) : null}
					</footer>
				</div>
			</SideTray>
			{gpxBrowserOpen ? (
				<Suspense
					fallback={
						<div
							className="fixed inset-4 z-50 grid place-items-center rounded-2xl border border-slate-600 bg-panel text-slate-400 text-sm shadow-2xl shadow-black/70 xl:top-6 xl:right-152 xl:bottom-6 xl:left-6"
							role="status"
						>
							Loading route browser…
						</div>
					}
				>
					<GpxBrowserDialog
						customCourseIds={customCourseIds}
						onClose={() => onCloseGpx?.()}
						onImportCourse={async (course) => {
							const imported = await onImportCourse(course);
							setSearchQuery('');
							workoutListScroll.scrollToTop();
							setLibraryStatus(`${imported.name} imported and saved on this device.`);
							return imported;
						}}
						onSelectRoute={onSelectGpxRoute}
						requestedCollectionId={gpxCollectionId}
						requestedProviderId={gpxProviderId}
						requestedRouteId={gpxRouteId}
						speedUnit={speedUnit}
					/>
				</Suspense>
			) : null}
			{mappedCourse ? (
				<Suspense
					fallback={
						<div
							className="fixed inset-4 z-50 grid place-items-center rounded-2xl border border-slate-600 bg-panel text-slate-400 text-sm shadow-2xl shadow-black/70 xl:top-6 xl:right-152 xl:bottom-6 xl:left-6"
							role="status"
						>
							Loading map…
						</div>
					}
				>
					<WorkoutMapDialog
						course={mappedCourse}
						onClose={() => setMappedCourse(undefined)}
						speedUnit={speedUnit}
					/>
				</Suspense>
			) : null}
			{renamingCourse ? (
				<RenameWorkoutDialog
					course={renamingCourse}
					key={renamingCourse.id}
					onClose={() => setRenamingCourse(undefined)}
					onRename={(courseId, name) => {
						const renamed = onRenameCourse(courseId, name);
						setLibraryStatus(`${renamed.name} renamed and saved on this device.`);
					}}
				/>
			) : null}
		</>
	);
}
