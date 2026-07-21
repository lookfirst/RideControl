import 'leaflet/dist/leaflet.css';
import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { formatDescriptionDistance } from '../lib/units';
import type { SpeedUnit, WorkoutCourse } from '../types';
import { WorkoutRouteMap } from './workout-route-map';

export function WorkoutMapDialog({
	course,
	onClose,
	speedUnit,
}: {
	course: WorkoutCourse;
	onClose: () => void;
	speedUnit: SpeedUnit;
}) {
	useCloseOnEscape(true, onClose);
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>();

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
							{formatDescriptionDistance(
								course.description,
								course.distance,
								speedUnit
							)}
						</p>
					</div>
					<button
						aria-label="Close workout map"
						className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						ref={closeButtonRef}
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
