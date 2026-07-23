import { BUILD_PR_URL, BUILD_TIMESTAMP_UTC, formatBuildTimestamp } from '../lib/build-info';

export function AppFooter({ onOpenWelcome }: { onOpenWelcome: () => void }) {
	return (
		<footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-1.5 gap-y-0.5 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[11px] text-slate-600 sm:px-8">
			<button
				className="font-semibold tracking-wide transition hover:text-slate-400"
				onClick={onOpenWelcome}
				type="button"
			>
				Ride Control
			</button>
			<span aria-hidden="true">·</span>
			<a
				className="transition hover:text-slate-400"
				href="https://github.com/RideControlOrg/RideControl"
				rel="noreferrer"
				target="_blank"
			>
				GitHub
			</a>
			<span aria-hidden="true">·</span>
			<a
				className="transition hover:text-slate-400"
				href="https://github.com/sponsors/lookfirst"
				rel="noreferrer"
				target="_blank"
			>
				Sponsor
			</a>
			<span aria-hidden="true">·</span>
			<a
				className="transition hover:text-slate-400"
				href={BUILD_PR_URL}
				rel="noreferrer"
				target="_blank"
				title={`Built from UTC timestamp ${BUILD_TIMESTAMP_UTC}`}
			>
				<time dateTime={BUILD_TIMESTAMP_UTC}>
					{formatBuildTimestamp(BUILD_TIMESTAMP_UTC)}
				</time>
			</a>
		</footer>
	);
}
