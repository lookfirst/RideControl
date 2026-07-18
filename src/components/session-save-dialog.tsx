import { useEffect, useState } from 'react';
import { formatDuration } from '../lib/format';
import { formatSessionTime } from '../lib/saved-sessions';
import type { SessionFeeling, SessionMetadata, SessionSnapshot, SpeedUnit } from '../types';
import { SmallMetric } from './metrics';

const feelings: { label: string; value: SessionFeeling }[] = [
	{ label: 'Great', value: 'great' },
	{ label: 'Good', value: 'good' },
	{ label: 'Okay', value: 'okay' },
	{ label: 'Tough', value: 'tough' },
	{ label: 'Exhausted', value: 'exhausted' },
];

export function SessionSaveDialog({
	continuing = false,
	open,
	onClose,
	onSave,
	onStartWithoutSaving,
	saving,
	session,
	speedUnit,
}: {
	continuing?: boolean;
	open: boolean;
	onClose: () => void;
	onSave: (metadata: SessionMetadata) => Promise<void>;
	onStartWithoutSaving: () => void;
	saving: boolean;
	session: SessionSnapshot;
	speedUnit: SpeedUnit;
}) {
	const [comments, setComments] = useState('');
	const [feeling, setFeeling] = useState<SessionFeeling>();

	useEffect(() => {
		if (open) {
			setComments('');
			setFeeling(undefined);
		}
	}, [open]);

	if (!open) {
		return null;
	}

	const unitFactor = speedUnit === 'mph' ? 0.621_371 : 1;
	const distanceUnit = speedUnit === 'mph' ? 'mi' : 'km';

	return (
		<div className="fixed inset-0 z-40 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<section
				aria-labelledby="save-session-title"
				aria-modal="true"
				className="w-full max-w-xl rounded-2xl border border-slate-600 bg-panel p-5 shadow-2xl shadow-black/50 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="font-bold text-[11px] text-mint tracking-[.14em]">
							SESSION ENDED
						</p>
						<h2 className="mt-1 font-bold text-2xl" id="save-session-title">
							Save this session?
						</h2>
						<p className="mt-1 text-slate-400 text-sm">
							Started at {formatSessionTime(session.startedAt)}
						</p>
					</div>
					<button
						aria-label="Close save session dialog"
						className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</div>

				<div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-[#12171d]">
					<SmallMetric label="TIME" value={formatDuration(session.elapsedSeconds)} />
					<SmallMetric
						label="DISTANCE"
						value={`${(session.distance * unitFactor).toFixed(2)} ${distanceUnit}`}
					/>
					<SmallMetric label="CALORIES" value={`${Math.round(session.calories)} kcal`} />
				</div>

				<fieldset className="mt-5">
					<legend className="font-semibold text-sm">How did it feel?</legend>
					<div className="mt-2 grid grid-cols-5 gap-1.5">
						{feelings.map((option) => (
							<button
								aria-pressed={feeling === option.value}
								className={`rounded-lg border px-2 py-2 font-semibold text-xs transition ${feeling === option.value ? 'border-mint bg-mint/10 text-mint' : 'border-line bg-[#12171d] text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}
								key={option.value}
								onClick={() => setFeeling(option.value)}
								type="button"
							>
								{option.label}
							</button>
						))}
					</div>
				</fieldset>

				<label className="mt-5 block font-semibold text-sm" htmlFor="session-comments">
					Comments <span className="font-normal text-slate-500">(optional)</span>
				</label>
				<textarea
					className="mt-2 min-h-24 w-full resize-y rounded-xl border border-line bg-[#10151a] px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-mint"
					id="session-comments"
					maxLength={2000}
					onChange={(event) => setComments(event.target.value)}
					placeholder="Anything worth remembering about this ride?"
					value={comments}
				/>

				<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						className="rounded-lg px-4 py-2.5 font-semibold text-slate-400 text-sm hover:bg-slate-800 hover:text-slate-200"
						disabled={saving}
						onClick={onStartWithoutSaving}
						type="button"
					>
						{continuing ? 'Continue without saving' : 'Start new without saving'}
					</button>
					<button
						className="rounded-lg bg-lime px-5 py-2.5 font-bold text-ink text-sm hover:bg-[#e4ff9c] disabled:opacity-50"
						disabled={saving}
						onClick={() => onSave({ comments, feeling })}
						type="button"
					>
						{saving ? 'Saving…' : 'Save session'}
					</button>
				</div>
			</section>
		</div>
	);
}
