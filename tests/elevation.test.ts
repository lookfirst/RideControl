import { describe, expect, test } from 'bun:test';
import {
	addElevationChange,
	elevationTotalsForSamples,
	restoreElevationTotals,
} from '../src/lib/elevation';

describe('elevation totals', () => {
	test('tracks cumulative climbing and downhill independently', () => {
		const totals = elevationTotalsForSamples([
			{ elevation: 10 },
			{ elevation: 15 },
			{ elevation: 12 },
			{},
			{ elevation: 20 },
		]);
		expect(totals).toEqual({ ascent: 13, descent: 3 });
		expect(addElevationChange(totals, 20, 18)).toEqual({ ascent: 13, descent: 5 });
	});

	test('restores saved totals and derives a fallback for older sessions', () => {
		const samples = [{ elevation: 20 }, { elevation: 28 }, { elevation: 23 }];
		expect(restoreElevationTotals({ ascent: 40, descent: 25 }, samples)).toEqual({
			ascent: 40,
			descent: 25,
		});
		expect(restoreElevationTotals(undefined, samples)).toEqual({ ascent: 8, descent: 5 });
	});
});
