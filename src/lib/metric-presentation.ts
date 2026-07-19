export const METRIC_PRESENTATION = {
	cadence: {
		accent: 'violet',
		chartColor: '#a78bfa',
		chartMinimumMaximum: 80,
		chartStep: 10,
		dashboardUnit: 'rpm',
		icon: 'cadence',
		label: 'Cadence',
		unit: 'rpm',
	},
	heartRate: {
		accent: 'rose',
		chartColor: '#fb7185',
		chartMinimumMaximum: 180,
		chartStep: 10,
		dashboardUnit: 'bpm',
		icon: 'heart',
		label: 'Heart rate',
		unit: 'bpm',
	},
	power: {
		accent: 'yellow',
		chartColor: '#facc15',
		chartMinimumMaximum: 100,
		chartStep: 50,
		dashboardUnit: 'watts',
		icon: 'bolt',
		label: 'Power',
		unit: 'W',
	},
	speed: {
		accent: 'sky',
		chartColor: '#38bdf8',
		icon: 'speed',
		label: 'Speed',
	},
} as const;

export const STANDARD_METRIC_KEYS = ['power', 'cadence', 'heartRate'] as const;

export function metricAccentClass(accent: string): string {
	if (accent === 'sky') {
		return 'bg-sky-400';
	}
	if (accent === 'yellow') {
		return 'bg-yellow-400';
	}
	if (accent === 'violet') {
		return 'bg-violet-400';
	}
	if (accent === 'rose') {
		return 'bg-rose-400';
	}
	return 'bg-mint';
}

export function metricIconClass(accent: string): string {
	if (accent === 'mint') {
		return 'text-mint';
	}
	if (accent === 'yellow') {
		return 'text-yellow-400';
	}
	if (accent === 'violet') {
		return 'text-violet-400';
	}
	if (accent === 'rose') {
		return 'text-rose-400';
	}
	return 'text-sky-400';
}
