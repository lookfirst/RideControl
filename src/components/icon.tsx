import { ICON_PATHS } from '../lib/icon-paths';

export function Icon({
	name,
	className = 'h-5 w-5',
	title = name,
}: {
	name: string;
	className?: string;
	title?: string;
}) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.8"
			viewBox="0 0 24 24"
		>
			<title>{title}</title>
			<path d={ICON_PATHS[name] ?? ICON_PATHS.bike} />
		</svg>
	);
}
