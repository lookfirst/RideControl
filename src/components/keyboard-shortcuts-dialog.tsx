import { useEffect } from 'react';

export interface KeyboardShortcutDescription {
	keys: string[];
	label: string;
}

export const dashboardKeyboardShortcuts: KeyboardShortcutDescription[] = [
	{ keys: ['Space'], label: 'Pause or resume the session' },
	{ keys: ['↑', '↓'], label: 'Increase or decrease resistance' },
	{ keys: ['←', '→'], label: 'Change the chart view' },
	{ keys: ['N'], label: 'Start a new session after ending' },
	{ keys: ['H'], label: 'Open session history' },
	{ keys: ['?'], label: 'Show keyboard shortcuts' },
	{ keys: ['Esc'], label: 'Close an open dialog' },
];

export function KeyboardShortcutsDialog({
	handleEscape = true,
	onClose,
	open,
	shortcuts = dashboardKeyboardShortcuts,
	title = 'Keyboard controls',
}: {
	handleEscape?: boolean;
	onClose: () => void;
	open: boolean;
	shortcuts?: KeyboardShortcutDescription[];
	title?: string;
}) {
	useEffect(() => {
		if (!(handleEscape && open)) {
			return;
		}
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
	}, [handleEscape, onClose, open]);

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<section
				aria-labelledby="keyboard-shortcuts-title"
				aria-modal="true"
				className="w-full max-w-md rounded-2xl border border-slate-600 bg-panel p-5 shadow-2xl shadow-black/50 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 className="font-bold text-2xl" id="keyboard-shortcuts-title">
						{title}
					</h2>
					<button
						aria-label="Close keyboard controls"
						className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</div>
				<div className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-[#12171d]">
					{shortcuts.map((shortcut) => (
						<div
							className="flex min-h-12 items-center justify-between gap-5 px-3.5 py-2.5"
							key={shortcut.label}
						>
							<span className="text-slate-300 text-sm">{shortcut.label}</span>
							<span className="flex shrink-0 gap-1.5">
								{shortcut.keys.map((key) => (
									<kbd
										className="min-w-8 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-center font-mono font-semibold text-slate-200 text-xs shadow-sm"
										key={key}
									>
										{key}
									</kbd>
								))}
							</span>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
