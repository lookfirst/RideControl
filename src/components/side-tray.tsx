import type { ReactNode } from 'react';
import { useAnimatedTray, useBodyScrollLock, useCloseOnEscape } from '../hooks/use-dialog-behavior';

export function SideTray({
	children,
	closeLabel,
	closeOnEscape = true,
	labelledBy,
	onClose,
	open,
	panelClassName = '',
}: {
	children: ReactNode;
	closeLabel: string;
	closeOnEscape?: boolean;
	labelledBy: string;
	onClose: () => void;
	open: boolean;
	panelClassName?: string;
}) {
	const { rendered, visible } = useAnimatedTray(open);
	useCloseOnEscape(closeOnEscape && open, onClose);
	useBodyScrollLock(rendered);

	if (!rendered) {
		return null;
	}

	return (
		<div
			className={`fixed inset-0 z-40 flex justify-end bg-black/65 backdrop-blur-sm transition-opacity duration-200 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
			data-side-tray="true"
		>
			<button
				aria-label={closeLabel}
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onClose}
				type="button"
			/>
			<section
				aria-labelledby={labelledBy}
				aria-modal="true"
				className={`relative z-10 ml-auto h-full w-full border-line border-l bg-panel shadow-2xl shadow-black/60 transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'} ${panelClassName}`}
				role="dialog"
			>
				{children}
			</section>
		</div>
	);
}
