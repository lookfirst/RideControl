import { emptyMetrics } from '../../src/constants';
import { CONTROL_MODE } from '../../src/lib/control-mode';
import type { SavedSession } from '../../src/types';

export const SAVED_SESSION_STARTED_AT = Date.UTC(2026, 6, 18, 16);

export const savedSessionFixture: SavedSession = {
	aggregates: {
		cadence: { count: 2, maximum: 82, sum: 162 },
		gear: { count: 0, maximum: 0, sum: 0 },
		heartRate: { count: 2, maximum: 142, sum: 282 },
		power: { count: 2, maximum: 210, sum: 410 },
		resistance: { count: 2, maximum: 45, sum: 85 },
	},
	calories: 220,
	comments: 'Hard & fun <again>',
	controlMode: CONTROL_MODE.RESISTANCE,
	distance: 1.5,
	elapsedSeconds: 2,
	endedAt: SAVED_SESSION_STARTED_AT + 2000,
	feeling: 'good',
	history: [
		{
			cadence: 80,
			elapsedSeconds: 1,
			heartRate: 140,
			power: 200,
			resistance: 40,
			speed: 28,
		},
		{
			cadence: 82,
			elapsedSeconds: 2,
			heartRate: 142,
			power: 210,
			resistance: 45,
			speed: 30,
		},
	],
	id: 'saved-session',
	maximums: {
		...emptyMetrics,
		cadence: 82,
		heartRate: 142,
		power: 210,
		speed: 30,
	},
	startedAt: SAVED_SESSION_STARTED_AT,
};
