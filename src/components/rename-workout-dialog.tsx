import { type FormEvent, useState } from 'react';
import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { errorMessage } from '../lib/errors';
import { MAX_WORKOUT_NAME_LENGTH } from '../lib/workout-file';
import type { WorkoutCourse } from '../types';

export function RenameWorkoutDialog({
	course,
	onClose,
	onRename,
}: {
	course: WorkoutCourse;
	onClose: () => void;
	onRename: (courseId: string, name: string) => void;
}) {
	const [name, setName] = useState(course.name);
	const [renameError, setRenameError] = useState('');
	const nameInputRef = useDialogInitialFocus<HTMLInputElement>();
	useCloseOnEscape(true, onClose);

	const submitRename = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setRenameError('');
		try {
			onRename(course.id, name);
			onClose();
		} catch (error) {
			setRenameError(errorMessage(error));
		}
	};

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<section
				aria-labelledby="rename-workout-title"
				aria-modal="true"
				className="w-full max-w-md rounded-2xl border border-slate-600 bg-panel p-5 shadow-2xl shadow-black/50 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 className="font-bold text-2xl" id="rename-workout-title">
						Rename workout
					</h2>
					<button
						aria-label="Close rename workout dialog"
						className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</div>
				<form className="mt-5" onSubmit={submitRename}>
					<label className="block font-semibold text-sm" htmlFor="workout-name">
						Workout name
					</label>
					<input
						className="mt-2 h-11 w-full rounded-xl border border-line bg-[#10151a] px-3 text-sm outline-none placeholder:text-slate-600 focus:border-mint"
						id="workout-name"
						maxLength={MAX_WORKOUT_NAME_LENGTH}
						onChange={(event) => setName(event.target.value)}
						placeholder="Name this workout"
						ref={nameInputRef}
						value={name}
					/>
					{renameError ? (
						<p aria-live="assertive" className="mt-2 text-rose-300 text-xs">
							{renameError}
						</p>
					) : null}
					<div className="mt-5 flex justify-end gap-2">
						<button
							className="rounded-lg px-4 py-2.5 font-semibold text-slate-400 text-sm hover:bg-slate-800 hover:text-white"
							onClick={onClose}
							type="button"
						>
							Cancel
						</button>
						<button
							className="rounded-lg bg-lime px-5 py-2.5 font-bold text-ink text-sm hover:bg-[#e4ff9c] disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!name.trim()}
							type="submit"
						>
							Save name
						</button>
					</div>
				</form>
			</section>
		</div>
	);
}
