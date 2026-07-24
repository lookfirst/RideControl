import {
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { useAnimatedTray, useBodyScrollLock, useCloseOnEscape } from '../hooks/use-dialog-behavior';
import {
	loadSideTrayWidth,
	persistSideTrayWidth,
	type SideTrayOverlay,
	sideTrayWidthWithinViewport,
} from '../lib/app-overlay';

const KEYBOARD_RESIZE_STEP_PX = 32;
const CLOSE_LABEL_PREFIX = /^Close /;

export function SideTray({
	children,
	closeLabel,
	closeOnEscape = true,
	labelledBy,
	onClose,
	open,
	panelClassName = '',
	tray,
}: {
	children: ReactNode;
	closeLabel: string;
	closeOnEscape?: boolean;
	labelledBy: string;
	onClose: () => void;
	open: boolean;
	panelClassName?: string;
	tray: SideTrayOverlay;
}) {
	const { rendered, visible } = useAnimatedTray(open);
	const [panelWidth, setPanelWidth] = useState<number>();
	const panel = useRef<HTMLElement>(null);
	const minimumWidth = useRef<number | undefined>(undefined);
	const preferredWidth = useRef<number | undefined>(undefined);
	const previousOpen = useRef(open);
	const pointerResize = useRef<
		| {
				pointerId: number;
				startWidth: number;
				startX: number;
		  }
		| undefined
	>(undefined);
	useCloseOnEscape(closeOnEscape && open, onClose);
	useBodyScrollLock(rendered);

	useLayoutEffect(() => {
		if (!rendered) {
			minimumWidth.current = undefined;
			preferredWidth.current = undefined;
			setPanelWidth(undefined);
			return;
		}
		if (!(open && panel.current) || panelWidth !== undefined) {
			return;
		}
		const measuredMinimum = Math.round(panel.current.getBoundingClientRect().width);
		if (measuredMinimum < 1) {
			return;
		}
		const savedWidth = loadSideTrayWidth(tray);
		const desiredWidth = Math.max(savedWidth ?? measuredMinimum, measuredMinimum);
		minimumWidth.current = measuredMinimum;
		preferredWidth.current = desiredWidth;
		setPanelWidth(
			sideTrayWidthWithinViewport(desiredWidth, measuredMinimum, window.innerWidth)
		);
	}, [open, panelWidth, rendered, tray]);

	useEffect(() => {
		if (previousOpen.current && !open && preferredWidth.current !== undefined) {
			persistSideTrayWidth(tray, preferredWidth.current);
		}
		previousOpen.current = open;
	}, [open, tray]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const fitWidthToViewport = () => {
			if (minimumWidth.current === undefined || preferredWidth.current === undefined) {
				return;
			}
			setPanelWidth(
				sideTrayWidthWithinViewport(
					preferredWidth.current,
					minimumWidth.current,
					window.innerWidth
				)
			);
		};
		window.addEventListener('resize', fitWidthToViewport);
		return () => window.removeEventListener('resize', fitWidthToViewport);
	}, [open]);

	if (!rendered) {
		return null;
	}

	const resizeTo = (width: number) => {
		if (minimumWidth.current === undefined) {
			return;
		}
		const nextWidth = sideTrayWidthWithinViewport(
			width,
			minimumWidth.current,
			window.innerWidth
		);
		preferredWidth.current = nextWidth;
		setPanelWidth(nextWidth);
	};
	const startResize = (event: PointerEvent<HTMLHRElement>) => {
		if (!(panel.current && minimumWidth.current)) {
			return;
		}
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		pointerResize.current = {
			pointerId: event.pointerId,
			startWidth: panel.current.getBoundingClientRect().width,
			startX: event.clientX,
		};
	};
	const continueResize = (event: PointerEvent<HTMLHRElement>) => {
		const resize = pointerResize.current;
		if (!resize || resize.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		resizeTo(resize.startWidth + resize.startX - event.clientX);
	};
	const finishResize = (event: PointerEvent<HTMLHRElement>) => {
		if (pointerResize.current?.pointerId !== event.pointerId) {
			return;
		}
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		pointerResize.current = undefined;
	};
	const resizeWithKeyboard = (event: KeyboardEvent<HTMLHRElement>) => {
		const currentWidth = panel.current?.getBoundingClientRect().width;
		if (!(currentWidth && minimumWidth.current)) {
			return;
		}
		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				resizeTo(currentWidth + KEYBOARD_RESIZE_STEP_PX);
				break;
			case 'ArrowRight':
				event.preventDefault();
				resizeTo(currentWidth - KEYBOARD_RESIZE_STEP_PX);
				break;
			case 'End':
				event.preventDefault();
				resizeTo(window.innerWidth);
				break;
			case 'Home':
				event.preventDefault();
				resizeTo(minimumWidth.current);
				break;
			default:
				break;
		}
	};
	const resizeLabel = closeLabel.replace(CLOSE_LABEL_PREFIX, 'Resize ');
	const panelStyle: CSSProperties | undefined =
		panelWidth === undefined
			? undefined
			: {
					maxWidth: 'none',
					width: panelWidth,
				};

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
				className={`relative z-10 ml-auto h-full w-full min-w-0 border-line border-l bg-panel shadow-2xl shadow-black/60 transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'} ${panelClassName}`}
				data-side-tray-width={panelWidth}
				ref={panel}
				role="dialog"
				style={panelStyle}
			>
				<hr
					aria-label={resizeLabel}
					aria-orientation="vertical"
					aria-valuemax={typeof window === 'undefined' ? undefined : window.innerWidth}
					aria-valuemin={minimumWidth.current}
					aria-valuenow={panelWidth}
					className="absolute inset-y-0 left-0 z-30 m-0 hidden h-full w-3 -translate-x-1/2 cursor-col-resize touch-none select-none border-0 bg-transparent sm:block"
					onKeyDown={resizeWithKeyboard}
					onPointerCancel={finishResize}
					onPointerDown={startResize}
					onPointerMove={continueResize}
					onPointerUp={finishResize}
					tabIndex={0}
					title={`${resizeLabel}. Drag left or use the arrow keys.`}
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-0 z-30 hidden h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500/70 shadow-sm sm:block"
				/>
				{children}
			</section>
		</div>
	);
}
