import { emptyElevationTotals } from '../constants';
import type { ElevationTotals, MetricSample } from '../types';
import { nonNegativeNumber } from './numbers';
import { isFiniteNumber, isRecord } from './type-guards';

export function addElevationChange(
	totals: ElevationTotals,
	previousElevation: number | undefined,
	elevation: number
): ElevationTotals {
	if (previousElevation === undefined) {
		return totals;
	}
	const change = elevation - previousElevation;
	return change >= 0
		? { ...totals, ascent: totals.ascent + change }
		: { ...totals, descent: totals.descent - change };
}

export function elevationTotalsForSamples(
	samples: Partial<Pick<MetricSample, 'elevation'>>[]
): ElevationTotals {
	let previousElevation: number | undefined;
	return samples.reduce<ElevationTotals>((totals, sample) => {
		if (!isFiniteNumber(sample.elevation)) {
			return totals;
		}
		const next = addElevationChange(totals, previousElevation, sample.elevation);
		previousElevation = sample.elevation;
		return next;
	}, emptyElevationTotals);
}

export function restoreElevationTotals(
	value: unknown,
	samples: Partial<Pick<MetricSample, 'elevation'>>[]
): ElevationTotals {
	if (!(isRecord(value) && isFiniteNumber(value.ascent) && isFiniteNumber(value.descent))) {
		return elevationTotalsForSamples(samples);
	}
	return {
		ascent: nonNegativeNumber(value.ascent),
		descent: nonNegativeNumber(value.descent),
	};
}
