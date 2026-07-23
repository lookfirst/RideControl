import { BUILD_TIMESTAMP_UTC, formatBuildTimestamp } from '../lib/build-info';

const linkClass =
	'rounded-sm transition hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-mint focus-visible:outline-offset-2';

export function AppFooter({
	onOpenPrivacy,
	onOpenProfile,
	onOpenTerms,
	onOpenVersion,
	onOpenWelcome,
}: {
	onOpenPrivacy: () => void;
	onOpenProfile: () => void;
	onOpenTerms: () => void;
	onOpenVersion: () => void;
	onOpenWelcome: () => void;
}) {
	return (
		<footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 border-slate-700/70 border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-slate-500 text-xs sm:px-8">
			<button
				className={`${linkClass} font-semibold tracking-wide`}
				onClick={onOpenWelcome}
				type="button"
			>
				Ride Control
			</button>
			<span aria-hidden="true">·</span>
			<a
				className={linkClass}
				href="https://github.com/sponsors/lookfirst"
				rel="noreferrer"
				target="_blank"
			>
				Sponsor
			</a>
			<span aria-hidden="true">·</span>
			<button className={linkClass} onClick={onOpenProfile} type="button">
				Profile
			</button>
			<span aria-hidden="true">·</span>
			<a className={linkClass} href="mailto:hello@ridecontrol.xyz">
				Contact
			</a>
			<span aria-hidden="true">·</span>
			<button className={linkClass} onClick={onOpenPrivacy} type="button">
				Privacy
			</button>
			<span aria-hidden="true">·</span>
			<button className={linkClass} onClick={onOpenTerms} type="button">
				Terms
			</button>
			<span aria-hidden="true">·</span>
			<a
				className={linkClass}
				href="https://github.com/RideControlOrg/RideControl"
				rel="noreferrer"
				target="_blank"
			>
				GitHub
			</a>
			<span aria-hidden="true">·</span>
			<button
				className={linkClass}
				onClick={onOpenVersion}
				title={formatBuildTimestamp(BUILD_TIMESTAMP_UTC).replace('Build: ', '')}
				type="button"
			>
				Version
			</button>
		</footer>
	);
}
