import { Children, type ReactNode } from 'react';

export function Dashboard({ children }: { children: ReactNode }) {
	return (
		<div className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-3 py-3 sm:px-8 sm:py-5">
			{children}
		</div>
	);
}

export function DashboardToolbar({ children }: { children: ReactNode }) {
	return <div className="mb-4 flex flex-wrap items-center justify-between gap-3">{children}</div>;
}

export function DashboardWorkspace({ children }: { children: ReactNode }) {
	const columns = Children.toArray(children).length > 1 ? 'xl:grid-cols-[1.45fr_.55fr]' : '';
	return <section className={`mt-4 grid min-w-0 gap-4 *:min-w-0 ${columns}`}>{children}</section>;
}
