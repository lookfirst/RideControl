import { Children, type ReactNode } from 'react';

export function Dashboard({ children }: { children: ReactNode }) {
	return <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">{children}</div>;
}

export function DashboardToolbar({ children }: { children: ReactNode }) {
	return <div className="mb-6 flex flex-wrap items-center justify-between gap-3">{children}</div>;
}

export function DashboardWorkspace({ children }: { children: ReactNode }) {
	const columns = Children.toArray(children).length > 1 ? 'xl:grid-cols-[1.45fr_.55fr]' : '';
	return <section className={`mt-6 grid gap-6 ${columns}`}>{children}</section>;
}
