import type { MetricSample, SavedSession } from '../types';

const TCX_NAMESPACE = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
const ACTIVITY_EXTENSION_NAMESPACE = 'http://www.garmin.com/xmlschemas/ActivityExtension/v2';
const RIDECONTROL_EXTENSION_NAMESPACE =
	'https://github.com/lookfirst/RideControl/xmlschemas/ActivityExtension/v1';

function xmlEscape(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function nonNegative(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function average({ count, sum }: { count: number; sum: number }): number {
	return count > 0 ? sum / count : 0;
}

function trackpointDistances(session: SavedSession): number[] {
	let elapsed = 0;
	let distance = 0;
	const integrated = session.history.map((sample) => {
		const nextElapsed = nonNegative(sample.elapsedSeconds);
		const seconds = Math.max(0, nextElapsed - elapsed);
		distance += (nonNegative(sample.speed) * seconds) / 3.6;
		elapsed = nextElapsed;
		return distance;
	});
	const totalMeters = nonNegative(session.distance) * 1000;
	if (distance > 0 && totalMeters > 0) {
		return integrated.map((meters) => (meters / distance) * totalMeters);
	}
	if (totalMeters > 0 && session.elapsedSeconds > 0) {
		return session.history.map(
			(sample) =>
				(Math.min(nonNegative(sample.elapsedSeconds), session.elapsedSeconds) /
					session.elapsedSeconds) *
				totalMeters
		);
	}
	return integrated;
}

function trackpointXml(sample: MetricSample, timestamp: number, distanceMeters: number): string {
	const heartRate = nonNegative(sample.heartRate);
	const controlExtension =
		typeof sample.gear === 'number'
			? `<rc:Gear>${Math.round(nonNegative(sample.gear))}</rc:Gear>`
			: `<rc:Resistance>${nonNegative(sample.resistance).toFixed(1)}</rc:Resistance>`;
	return `
					<Trackpoint>
						<Time>${new Date(timestamp).toISOString()}</Time>
						<DistanceMeters>${distanceMeters.toFixed(3)}</DistanceMeters>${
							heartRate > 0
								? `
						<HeartRateBpm><Value>${Math.round(heartRate)}</Value></HeartRateBpm>`
								: ''
						}
						<Cadence>${Math.min(255, Math.round(nonNegative(sample.cadence)))}</Cadence>
						<SensorState>Present</SensorState>
						<Extensions>
							<ns3:TPX>
								<ns3:Speed>${(nonNegative(sample.speed) / 3.6).toFixed(3)}</ns3:Speed>
								<ns3:Watts>${Math.round(nonNegative(sample.power))}</ns3:Watts>
							</ns3:TPX>
							${controlExtension}
						</Extensions>
					</Trackpoint>`;
}

export function sessionToTcx(session: SavedSession): string {
	const startedAt = new Date(session.startedAt).toISOString();
	const distances = trackpointDistances(session);
	const trackpoints = session.history
		.map((sample, index) =>
			trackpointXml(
				sample,
				session.startedAt + nonNegative(sample.elapsedSeconds) * 1000,
				distances[index] ?? 0
			)
		)
		.join('');
	const notes = [
		session.feeling ? `Feeling: ${session.feeling}` : '',
		session.comments ? `Comments: ${session.comments}` : '',
	]
		.filter(Boolean)
		.join('\n');
	const averageHeartRate = average(session.aggregates.heartRate);
	const averageCadence = average(session.aggregates.cadence);
	const averagePower = average(session.aggregates.power);
	const controlSummary =
		session.controlMode === 'gear'
			? `<rc:AverageGear>${average(session.aggregates.gear).toFixed(1)}</rc:AverageGear>
						<rc:MaximumGear>${Math.max(0, ...session.history.map((sample) => nonNegative(sample.gear))).toFixed(0)}</rc:MaximumGear>`
			: `<rc:AverageResistance>${average(session.aggregates.resistance).toFixed(1)}</rc:AverageResistance>
						<rc:MaximumResistance>${Math.max(0, ...session.history.map((sample) => nonNegative(sample.resistance))).toFixed(1)}</rc:MaximumResistance>`;
	const distanceMeters = nonNegative(session.distance) * 1000;
	const averageSpeed = session.elapsedSeconds > 0 ? distanceMeters / session.elapsedSeconds : 0;

	return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="${TCX_NAMESPACE}" xmlns:ns3="${ACTIVITY_EXTENSION_NAMESPACE}" xmlns:rc="${RIDECONTROL_EXTENSION_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${TCX_NAMESPACE} http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd ${ACTIVITY_EXTENSION_NAMESPACE} http://www.garmin.com/xmlschemas/ActivityExtensionv2.xsd">
	<Activities>
		<Activity Sport="Biking">
			<Id>${startedAt}</Id>
			<Lap StartTime="${startedAt}">
				<TotalTimeSeconds>${nonNegative(session.elapsedSeconds).toFixed(3)}</TotalTimeSeconds>
				<DistanceMeters>${distanceMeters.toFixed(3)}</DistanceMeters>
				<MaximumSpeed>${(nonNegative(session.maximums.speed) / 3.6).toFixed(3)}</MaximumSpeed>
				<Calories>${Math.round(nonNegative(session.calories))}</Calories>${
					averageHeartRate > 0
						? `
				<AverageHeartRateBpm><Value>${Math.round(averageHeartRate)}</Value></AverageHeartRateBpm>`
						: ''
				}${
					session.maximums.heartRate > 0
						? `
				<MaximumHeartRateBpm><Value>${Math.round(nonNegative(session.maximums.heartRate))}</Value></MaximumHeartRateBpm>`
						: ''
				}
				<Intensity>Active</Intensity>
				<Cadence>${Math.min(255, Math.round(averageCadence))}</Cadence>
				<TriggerMethod>Manual</TriggerMethod>
				<Track>${trackpoints}
				</Track>
				<Extensions>
					<ns3:LX>
						<ns3:AvgSpeed>${averageSpeed.toFixed(3)}</ns3:AvgSpeed>
						<ns3:AvgWatts>${Math.round(averagePower)}</ns3:AvgWatts>
						<ns3:MaxWatts>${Math.round(nonNegative(session.maximums.power))}</ns3:MaxWatts>
					</ns3:LX>
					<rc:Summary>
						${controlSummary}
					</rc:Summary>
				</Extensions>
			</Lap>${
				notes
					? `
			<Notes>${xmlEscape(notes)}</Notes>`
					: ''
			}
		</Activity>
	</Activities>
</TrainingCenterDatabase>
`;
}

export function sessionTcxFilename(session: Pick<SavedSession, 'startedAt'>): string {
	return `ride-control-${new Date(session.startedAt).toISOString().replaceAll(':', '-')}.tcx`;
}

export function downloadSessionTcx(session: SavedSession): void {
	const url = URL.createObjectURL(
		new Blob([sessionToTcx(session)], { type: 'application/vnd.garmin.tcx+xml' })
	);
	const anchor = document.createElement('a');
	anchor.download = sessionTcxFilename(session);
	anchor.href = url;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}
