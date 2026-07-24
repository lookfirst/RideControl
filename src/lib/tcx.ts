import type { MetricSample, SavedSession, SessionWorkout } from '../types';
import {
	ACTIVITY_FILE_FORMAT,
	sessionActivityFilename,
	sessionSampleDistances,
} from './activity-file';
import { CONTROL_MODE } from './control-mode';
import { downloadBrowserFile } from './download';
import { aggregateAverage, aggregateMaximum } from './format';
import { nonNegativeNumber } from './numbers';
import type { RiderPhysicsProfile } from './profile';
import {
	RIDECONTROL_TCX_EXTENSION_NAMESPACE,
	TCX_ACTIVITY_EXTENSION_NAMESPACE,
	TCX_NAMESPACE,
} from './tcx-schema';
import { metersForKilometers, metersPerSecond, millisecondsForSeconds } from './units';
import { xmlEscape } from './xml';

function trackpointXml(sample: MetricSample, timestamp: number, distanceMeters: number): string {
	const heartRate = nonNegativeNumber(sample.heartRate);
	const altitude =
		sample.elevation === undefined
			? ''
			: `\n\t\t\t\t\t\t<AltitudeMeters>${nonNegativeNumber(sample.elevation).toFixed(2)}</AltitudeMeters>`;
	const controlExtensions = [
		sample.gear === undefined
			? ''
			: `<rc:Gear>${Math.round(nonNegativeNumber(sample.gear))}</rc:Gear>`,
		sample.resistance === undefined
			? ''
			: `<rc:Resistance>${nonNegativeNumber(sample.resistance).toFixed(1)}</rc:Resistance>`,
	]
		.filter(Boolean)
		.join('\n\t\t\t\t\t\t\t');
	const workoutExtensions = [
		sample.grade === undefined ? '' : `<rc:Grade>${sample.grade.toFixed(2)}</rc:Grade>`,
		sample.workoutDistance === undefined
			? ''
			: `<rc:WorkoutDistance>${nonNegativeNumber(sample.workoutDistance).toFixed(3)}</rc:WorkoutDistance>`,
		sample.workoutLap === undefined
			? ''
			: `<rc:WorkoutLap>${Math.max(1, Math.round(sample.workoutLap))}</rc:WorkoutLap>`,
	]
		.filter(Boolean)
		.join('\n\t\t\t\t\t\t\t');
	return `
					<Trackpoint>
						<Time>${new Date(timestamp).toISOString()}</Time>
						<DistanceMeters>${distanceMeters.toFixed(3)}</DistanceMeters>${altitude}${
							heartRate > 0
								? `
						<HeartRateBpm><Value>${Math.round(heartRate)}</Value></HeartRateBpm>`
								: ''
						}
						<Cadence>${Math.min(255, Math.round(nonNegativeNumber(sample.cadence)))}</Cadence>
						<SensorState>Present</SensorState>
						<Extensions>
							<ns3:TPX>
								<ns3:Speed>${metersPerSecond(nonNegativeNumber(sample.speed)).toFixed(3)}</ns3:Speed>
								<ns3:Watts>${Math.round(nonNegativeNumber(sample.power))}</ns3:Watts>
							</ns3:TPX>
							${controlExtensions}${workoutExtensions ? `\n\t\t\t\t\t\t\t${workoutExtensions}` : ''}
						</Extensions>
					</Trackpoint>`;
}

function workoutSummaryXml(workout?: SessionWorkout): string {
	if (!workout) {
		return '';
	}
	const { course } = workout;
	const points = course.points
		.map(
			(point) => `
							<rc:Point>
								<rc:Distance>${point.distance.toFixed(3)}</rc:Distance>
								<rc:Elevation>${point.elevation.toFixed(2)}</rc:Elevation>
								<rc:Latitude>${point.latitude.toFixed(8)}</rc:Latitude>
								<rc:Longitude>${point.longitude.toFixed(8)}</rc:Longitude>
								<rc:X>${point.x.toFixed(2)}</rc:X>
								<rc:Y>${point.y.toFixed(2)}</rc:Y>
							</rc:Point>`
		)
		.join('');
	return `
						<rc:Workout>
							<rc:CourseId>${xmlEscape(course.id)}</rc:CourseId>
							<rc:Name>${xmlEscape(course.name)}</rc:Name>
							<rc:Description>${xmlEscape(course.description)}</rc:Description>
							<rc:Difficulty>${course.difficulty}</rc:Difficulty>
							<rc:CourseType>${course.routeType}</rc:CourseType>
							<rc:Distance>${course.distance.toFixed(3)}</rc:Distance>${points}
						</rc:Workout>`;
}

function profileSummaryXml(profile?: RiderPhysicsProfile): string {
	if (!profile) {
		return '';
	}
	return `
						<rc:ProfileSnapshot>
							<rc:RiderWeightKilograms>${profile.riderWeightKg.toFixed(3)}</rc:RiderWeightKilograms>
							<rc:BikeWeightKilograms>${profile.bikeWeightKg.toFixed(3)}</rc:BikeWeightKilograms>
							<rc:FrontChainrings>${profile.frontChainringTeeth.join('/')}</rc:FrontChainrings>
							<rc:RearCassette>${profile.rearCassetteTeeth.join('/')}</rc:RearCassette>
						</rc:ProfileSnapshot>`;
}

export function sessionToTcx(session: SavedSession): string {
	const startedAt = new Date(session.startedAt).toISOString();
	const distances = sessionSampleDistances(session);
	const trackpoints = session.history
		.map((sample, index) =>
			trackpointXml(
				sample,
				session.startedAt +
					millisecondsForSeconds(nonNegativeNumber(sample.elapsedSeconds)),
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
	const averageHeartRate = aggregateAverage(session.aggregates.heartRate);
	const averageCadence = aggregateAverage(session.aggregates.cadence);
	const averagePower = aggregateAverage(session.aggregates.power);
	const hasRecordedGear =
		session.controlMode === CONTROL_MODE.GEAR || session.aggregates.gear.count > 0;
	const hasRecordedResistance =
		session.controlMode === CONTROL_MODE.RESISTANCE || session.aggregates.resistance.count > 0;
	const controlSummary = [
		hasRecordedGear
			? `<rc:AverageGear>${aggregateAverage(session.aggregates.gear).toFixed(1)}</rc:AverageGear>
						<rc:MaximumGear>${Math.max(aggregateMaximum(session.aggregates.gear), ...session.history.map((sample) => nonNegativeNumber(sample.gear))).toFixed(0)}</rc:MaximumGear>`
			: '',
		hasRecordedResistance
			? `<rc:AverageResistance>${aggregateAverage(session.aggregates.resistance).toFixed(1)}</rc:AverageResistance>
						<rc:MaximumResistance>${Math.max(aggregateMaximum(session.aggregates.resistance), ...session.history.map((sample) => nonNegativeNumber(sample.resistance))).toFixed(1)}</rc:MaximumResistance>`
			: '',
	]
		.filter(Boolean)
		.join('\n\t\t\t\t\t\t');
	const distanceMeters = metersForKilometers(nonNegativeNumber(session.distance));
	const averageSpeed = session.elapsedSeconds > 0 ? distanceMeters / session.elapsedSeconds : 0;

	return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="${TCX_NAMESPACE}" xmlns:ns3="${TCX_ACTIVITY_EXTENSION_NAMESPACE}" xmlns:rc="${RIDECONTROL_TCX_EXTENSION_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${TCX_NAMESPACE} http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd ${TCX_ACTIVITY_EXTENSION_NAMESPACE} http://www.garmin.com/xmlschemas/ActivityExtensionv2.xsd">
	<Activities>
		<Activity Sport="Biking">
			<Id>${startedAt}</Id>
			<Lap StartTime="${startedAt}">
				<TotalTimeSeconds>${nonNegativeNumber(session.elapsedSeconds).toFixed(3)}</TotalTimeSeconds>
				<DistanceMeters>${distanceMeters.toFixed(3)}</DistanceMeters>
				<MaximumSpeed>${metersPerSecond(nonNegativeNumber(session.maximums.speed)).toFixed(3)}</MaximumSpeed>
				<Calories>${Math.round(nonNegativeNumber(session.calories))}</Calories>${
					averageHeartRate > 0
						? `
				<AverageHeartRateBpm><Value>${Math.round(averageHeartRate)}</Value></AverageHeartRateBpm>`
						: ''
				}${
					session.maximums.heartRate > 0
						? `
				<MaximumHeartRateBpm><Value>${Math.round(nonNegativeNumber(session.maximums.heartRate))}</Value></MaximumHeartRateBpm>`
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
						<ns3:MaxWatts>${Math.round(nonNegativeNumber(session.maximums.power))}</ns3:MaxWatts>
					</ns3:LX>
					<rc:Summary>
						<rc:SessionId>${xmlEscape(session.id)}</rc:SessionId>
						<rc:TotalAscentMeters>${nonNegativeNumber(session.elevationTotals.ascent).toFixed(2)}</rc:TotalAscentMeters>
						<rc:TotalDescentMeters>${nonNegativeNumber(session.elevationTotals.descent).toFixed(2)}</rc:TotalDescentMeters>
						${controlSummary}${profileSummaryXml(session.profileSnapshot)}${workoutSummaryXml(session.workout)}
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
	return sessionActivityFilename(session, ACTIVITY_FILE_FORMAT.TCX);
}

export function downloadSessionTcx(session: SavedSession): void {
	downloadBrowserFile(
		sessionToTcx(session),
		sessionTcxFilename(session),
		'application/vnd.garmin.tcx+xml'
	);
}
