import { useCallback, useEffect, useRef, useState } from 'react';
import { useCloseOnEscape } from '../hooks/use-dialog-behavior';

export function WelcomeDialog({
	onClose,
	open,
}: {
	onClose: (dontShowAgain: boolean) => void;
	open: boolean;
}) {
	const [dontShowAgain, setDontShowAgain] = useState(false);
	const dontShowAgainRef = useRef(false);
	const closeFromEscape = useCallback(() => onClose(dontShowAgainRef.current), [onClose]);
	useCloseOnEscape(open, closeFromEscape);

	useEffect(() => {
		if (!open) {
			return;
		}
		dontShowAgainRef.current = false;
		setDontShowAgain(false);
	}, [open]);

	function updateDontShowAgain(checked: boolean) {
		dontShowAgainRef.current = checked;
		setDontShowAgain(checked);
	}

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<section
				aria-describedby="welcome-description"
				aria-labelledby="welcome-title"
				aria-modal="true"
				className="w-full max-w-lg rounded-2xl border border-slate-600 bg-panel p-5 shadow-2xl shadow-black/50 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 className="font-bold text-2xl" id="welcome-title">
						RideControl.xyz
					</h2>
					<button
						aria-label="Close welcome message"
						className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={() => onClose(dontShowAgain)}
						type="button"
					>
						×
					</button>
				</div>

				<p className="mt-4 text-slate-300 text-sm leading-6" id="welcome-description">
					Pair your trainer, heart rate monitor, and Zwift Click over Bluetooth, then
					adjust resistance or shift virtual gears while keeping detailed records of every
					ride—all from your browser.
				</p>
				<p className="mt-3 text-slate-400 text-sm leading-6">
					Ride Control is a freely available, open-source GPLv3 application. View the{' '}
					<a
						className="font-semibold text-mint underline decoration-mint/40 underline-offset-2 hover:decoration-mint"
						href="https://github.com/lookfirst/RideControl"
						rel="noreferrer"
						target="_blank"
					>
						source code on GitHub
					</a>
					.
				</p>
				<p className="mt-2 text-slate-400 text-sm leading-6">
					Everything runs locally, and all ride data stays in your browser. We don't
					upload it anywhere, although we may add an opt-in feature in the future that
					would only upload data with your permission.
				</p>
				<p className="mt-2 text-slate-400 text-sm leading-6">
					From the history, you can download your rides as TCX files and upload them to
					your preferred cycling service whenever you choose.
				</p>
				<p className="mt-3 rounded-xl border border-line bg-[#12171d] px-3.5 py-3 text-slate-400 text-sm">
					Press <kbd className="font-mono font-semibold text-slate-200">?</kbd> anytime to
					see the available keyboard controls.
				</p>

				<div className="mt-5 flex flex-col gap-4 border-line border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
					<label className="inline-flex cursor-pointer items-center gap-2.5 text-slate-300 text-sm">
						<input
							checked={dontShowAgain}
							className="h-4 w-4 accent-lime"
							onChange={(event) => updateDontShowAgain(event.target.checked)}
							type="checkbox"
						/>
						Don't show again
					</label>
					<button
						className="rounded-lg bg-lime px-5 py-2.5 font-bold text-ink text-sm hover:bg-[#e4ff9c]"
						onClick={() => onClose(dontShowAgain)}
						type="button"
					>
						Get started
					</button>
				</div>
			</section>
		</div>
	);
}
