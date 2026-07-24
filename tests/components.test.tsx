import { describe, expect, test } from 'bun:test';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuildDetailsDialog } from '../src/components/build-details-dialog';
import { ConnectionControl } from '../src/components/connection-control';
import { DevicePairingButton, DevicePairingPanel } from '../src/components/device-pairing';
import { GearControl } from '../src/components/gear-control';
import { Icon } from '../src/components/icon';
import { KeyboardShortcutsDialog } from '../src/components/keyboard-shortcuts-dialog';
import { PrivacyPolicyDialog, TermsOfServiceDialog } from '../src/components/legal-dialog';
import { Metric, SessionMetric, SmallMetric } from '../src/components/metrics';
import { Notification } from '../src/components/notification';
import { ProfileDialog } from '../src/components/profile-dialog';
import { RenameWorkoutDialog } from '../src/components/rename-workout-dialog';
import { ResistanceControl } from '../src/components/resistance-control';
import { SessionChart } from '../src/components/session-chart';
import { SessionControls } from '../src/components/session-controls';
import { DeleteSessionDialog, SessionDetail } from '../src/components/session-detail';
import { SessionHistory } from '../src/components/session-history';
import { SessionHistoryList } from '../src/components/session-history-list';
import { SessionSaveDialog } from '../src/components/session-save-dialog';
import { TrainingControl } from '../src/components/training-control';
import { WelcomeDialog } from '../src/components/welcome-dialog';
import { WorkoutPanel } from '../src/components/workout-panel';
import { WorkoutProgress } from '../src/components/workout-progress';
import {
	CHROME_BLUETOOTH_FLAGS_URL,
	CHROME_BLUETOOTH_PERMISSION_MESSAGE,
	emptyMetrics,
	emptySession,
} from '../src/constants';
import { formatGrade } from '../src/lib/format';
import { historyKeyboardShortcuts } from '../src/lib/keyboard';
import { metricAccentClass, metricIconClass } from '../src/lib/metric-presentation';
import { formatSessionImportTime, sessionSummary } from '../src/lib/saved-sessions';
import { SESSION_WORKFLOW_INTENT } from '../src/lib/session-workflow';
import { WORKOUT_DESCRIPTION_ATTRIBUTION } from '../src/lib/workout-description';
import { WORKOUT_ROUTE_TYPE } from '../src/lib/workout-schema';
import { WORKOUT_COURSES, workoutTerrainAtDistance } from '../src/lib/workouts';
import { createAppRouter } from '../src/router';
import type { StoredSession } from '../src/types';
import { savedSessionFixture } from './fixtures/saved-session';

const render = (element: React.ReactNode) => renderToStaticMarkup(element);
const renderApp = async (initialSession?: StoredSession) => {
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: ['/'] }),
		initialSession,
	});
	await router.load();
	return render(<RouterProvider router={router} />);
};
const enabledEndSessionButton = /<button(?![^>]*disabled)[^>]*>End session<\/button>/;
const solidChartBoundaries =
	/d="M0 14H100 M0 90H100"[^>]*stroke="#3a4654"(?![^>]*stroke-dasharray)/;
const dashedChartGuides =
	/d="M0 52H100 M25 14V90 M50 14V90 M75 14V90"[^>]*stroke-dasharray="2.5 2.5"/;
const noCustomWorkoutIds = new Set<string>();

describe('view components', () => {
	test('renders known and fallback icons', () => {
		expect(render(<Icon name="heart" />)).toContain('<title>heart</title>');
		expect(render(<Icon name="move-vertical" />)).toContain('<title>move-vertical</title>');
		expect(render(<Icon name="unknown" />)).toContain('<title>unknown</title>');
	});

	test('renders metric values and accent classes', () => {
		const html = render(
			<Metric
				accent="yellow"
				average="180"
				label="POWER"
				maximum="300"
				unit="watts"
				value="200"
			/>
		);
		expect(html).toContain('POWER');
		expect(html).toContain('200');
		expect(html).toContain('rounded-2xl border border-line bg-panel p-4');
		expect(html).toContain('mt-3 flex items-baseline gap-2');
		expect(html).toContain('grid grid-cols-2 gap-3 border-line border-t pt-3');
		expect(html).toContain('font-semibold text-6xl tracking-tight');
		expect(html).toContain('font-semibold text-4xl text-white tabular-nums tracking-tight');
		expect(html).toContain('>180</p>');
		expect(html).toContain('>300</p>');
		expect(html.match(/watts/g)).toHaveLength(1);
		expect(metricAccentClass('rose')).toBe('bg-rose-400');
		expect(metricAccentClass('other')).toBe('bg-mint');
		expect(metricIconClass('violet')).toBe('text-violet-400');
		expect(metricIconClass('other')).toBe('text-sky-400');
	});

	test('renders a compact session metric', () => {
		expect(render(<SmallMetric label="TIME" value="01:02:03" />)).toContain('01:02:03');
		const largeMetric = render(<SmallMetric label="TIME" large value="01:02:03" />);
		expect(largeMetric).toContain('min-w-0 px-3 py-3 sm:px-5');
		expect(largeMetric).toContain('text-3xl sm:text-5xl min-[420px]:text-2xl');
		const distance = render(<SmallMetric label="DISTANCE" large unit="mi" value="10.00" />);
		expect(distance).toContain('>10.00</span>');
		expect(distance).toContain('shrink-0 font-medium');
		expect(distance).toContain('text-sm sm:text-xl');
		expect(distance).toContain('>mi</span>');
		const html = render(
			<SessionMetric
				accent="yellow"
				average="185"
				icon="bolt"
				label="POWER"
				maximum="300"
				unit="W"
			/>
		);
		expect(html).toContain('text-3xl');
		expect(html).toContain('bg-yellow-400');
		expect(html).toContain('<title>bolt</title>');
		expect(html.match(/>W<\/span>/g)).toHaveLength(1);
		expect(html).toContain('MAX</strong>300');
		const averageOnly = render(
			<SessionMetric
				accent="mint"
				average="42"
				icon="resistance"
				label="RESISTANCE"
				unit="%"
			/>
		);
		expect(averageOnly).toContain('text-mint');
		expect(averageOnly).not.toContain('MAX');
	});

	test('renders enabled and disabled resistance controls', () => {
		const enabled = render(
			<ResistanceControl
				disabled={false}
				keyboardFlash="increase"
				max={100}
				min={0}
				onChange={() => undefined}
				ramp={{ current: 35, from: 20, phase: 'ramping', progress: 0.4, to: 60 }}
				step={1}
				value={20}
			/>
		);
		const disabled = render(
			<ResistanceControl
				disabled
				max={100}
				min={0}
				onChange={() => undefined}
				ramp={{ current: 20, from: 20, phase: 'holding', progress: 0, to: 20 }}
				step={1}
				value={20}
			/>
		);
		expect(enabled).toContain('aria-label="Resistance"');
		expect(enabled).toContain('value="20"');
		expect(enabled).toContain('class="resistance-slider w-full min-w-0 disabled:opacity-40"');
		expect(enabled).toContain('grid h-9 w-9 shrink-0 place-items-center rounded-lg');
		expect(enabled).toContain('data-ramp-active="true"');
		expect(enabled).toContain('data-ramp-progress="40"');
		expect(enabled).toContain('data-resistance-control="true"');
		expect(enabled).toContain('--ramp-progress:144deg');
		expect(enabled).toContain('--resistance-position:20%');
		expect(enabled).not.toContain('Ramping');
		expect(enabled).not.toContain('>20%<');
		expect(enabled).not.toContain('>60%<');
		expect(enabled).toContain('data-keyboard-flash="true"');
		expect(enabled).toContain('scale-105 border-mint bg-mint/15 text-mint');
		expect(disabled).toContain('data-ramp-progress="0"');
		expect(disabled).toContain('disabled');
		const queued = render(
			<ResistanceControl
				disabled={false}
				max={100}
				min={0}
				onChange={() => undefined}
				ramp={{ current: 20, from: 20, phase: 'queued', progress: 0, to: 60 }}
				step={1}
				value={60}
			/>
		);
		const settled = render(
			<ResistanceControl
				disabled={false}
				max={100}
				min={0}
				onChange={() => undefined}
				ramp={{ current: 60, from: 20, phase: 'settled', progress: 1, to: 60 }}
				step={1}
				value={60}
			/>
		);
		expect(queued).toContain('data-ramp-progress="0"');
		expect(settled).toContain('data-ramp-progress="100"');
		expect(queued).not.toContain('data-ramp-active');
		expect(settled).not.toContain('data-ramp-active');
		expect(queued).not.toContain('Queued');
		expect(settled).not.toContain('Settled');
	});

	test('renders connection, busy, and connected states', () => {
		const ready = render(
			<ConnectionControl
				busy={false}
				connected={false}
				onCancel={() => undefined}
				onConnect={() => undefined}
				onDisconnect={() => undefined}
				status="Ready"
			/>
		);
		expect(ready).toContain('Connect trainer');
		expect(ready).not.toContain('bg-ink/50');
		const busy = render(
			<ConnectionControl
				busy
				connected={false}
				onCancel={() => undefined}
				onConnect={() => undefined}
				onDisconnect={() => undefined}
				status="Connecting…"
			/>
		);
		expect(busy).toContain('role="status"');
		expect(busy).toContain('Connecting…');
		expect(busy).toContain('Cancel');
		expect(busy).toContain('inline-flex h-10 items-center gap-2 px-1');
		expect(busy).not.toContain('bg-[#10151a]');
		expect(busy).not.toContain('Connect trainer');
		expect(
			render(
				<ConnectionControl
					busy={false}
					connected
					deviceName="KICKR"
					onCancel={() => undefined}
					onConnect={() => undefined}
					onDisconnect={() => undefined}
					status="Connected"
				/>
			)
		).toContain('Disconnect');
		expect(
			render(
				<ConnectionControl
					busy
					connected
					deviceName="KICKR"
					onCancel={() => undefined}
					onConnect={() => undefined}
					onDisconnect={() => undefined}
					status="Connected"
				/>
			)
		).toContain('Disconnect');
	});

	test('renders the multi-device pairing entry point and panel', () => {
		expect(
			render(
				<DevicePairingButton connectedCount={0} onClick={() => undefined} pairedCount={0} />
			)
		).toContain('Pair devices');
		expect(
			render(
				<DevicePairingButton connectedCount={2} onClick={() => undefined} pairedCount={3} />
			)
		).toContain('2/3');
		const connectingButton = render(
			<DevicePairingButton
				connectedCount={1}
				connecting
				onClick={() => undefined}
				pairedCount={3}
			/>
		);
		expect(connectingButton).toContain('aria-busy="true"');
		expect(connectingButton).toContain('connection-status-pulse bg-sky-300');
		expect(connectingButton).not.toContain('bg-sky-400/10');
		const connectedButton = render(
			<DevicePairingButton connectedCount={3} onClick={() => undefined} pairedCount={3} />
		);
		expect(connectedButton).toContain('bg-mint');
		expect(connectedButton).not.toContain('bg-sky-400');
		const common = {
			busy: false,
			connected: false,
			onCancel: () => undefined,
			onDisconnect: () => undefined,
			onForget: () => undefined,
			onPair: () => undefined,
			onReconnect: () => undefined,
			paired: false,
			phase: 'unpaired' as const,
			reconnecting: false,
			status: 'Not paired',
		};
		const panel = render(
			<DevicePairingPanel
				browserNotice=""
				click={{
					...common,
					busy: true,
					connectedCount: 0,
					connectionActive: true,
					controllers: [
						{
							active: true,
							activeShift: 'down',
							battery: 84,
							busy: true,
							connected: false,
							firmwareVersion: '1.2.0',
							id: 'plus-click',
							label: '+ Controller',
							paired: true,
							phase: 'reconnecting',
							reconnecting: true,
							role: 'up',
							status: 'Reconnecting…',
						},
					],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					paired: true,
					pairedCount: 1,
					phase: 'reconnecting',
					reconnecting: true,
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={{ ...common, connected: true, name: 'KICKR CORE 2', paired: true }}
			/>
		);
		expect(panel).toContain('Paired devices');
		expect(panel).toContain('data-side-tray="true"');
		expect(panel).toContain('transition-opacity duration-200');
		expect(panel).toContain('transition-transform duration-200');
		expect(panel).toContain('translate-x-0');
		expect(panel).toContain('Smart trainer');
		expect(panel).toContain('Heart rate');
		expect(panel).toContain('Zwift Click V2');
		expect(panel).not.toContain('Reconnecting…');
		expect(panel).not.toContain('Waiting for controllers…');
		expect(panel).not.toContain('Retry');
		expect(panel).toContain('Connecting...');
		expect(panel).toContain('>Stop connecting</button>');
		expect(panel).not.toContain('>Reconnect</button>');
		expect(panel.match(/<span class="sr-only">Connecting\.\.\.<\/span>/g)).toHaveLength(1);
		expect(panel.match(/connecting-dot/g)).toHaveLength(3);
		expect(panel.match(/connection-status-pulse/g)).toHaveLength(2);
		expect(panel).toContain('shadow-[0_0_16px_rgba(56,189,248,.95)]');
		expect(panel).toContain('Automatic reconnect in Chrome');
		expect(panel).toContain('Chrome needs persistent Bluetooth permissions');
		expect(panel).toContain('chrome://flags/#enable-web-bluetooth-new-permissions-backend');
		expect(panel).toContain('Copy Chrome Bluetooth settings address');
		expect(panel).toContain('Use the new permissions backend for Web Bluetooth');
		expect(panel).toContain('Relaunch Chrome, then pair each device once more.');
		expect(panel).not.toContain('github.com/RideControlOrg/RideControl#automatic-reconnect');
		expect(panel).toContain('+ Controller');
		expect(panel).not.toContain('− Controller');
		expect(panel).toContain('aria-label="− shift pressed"');
		expect(panel).toContain('>−</output>');
		expect(panel).toContain('grid h-5 w-5 shrink-0');
		expect(panel).toContain('Firmware 1.2.0 · 84% battery');
		expect(panel).not.toContain('Use firmware 1.2.0');
		expect(panel).not.toContain(
			'https://support.zwift.com/updating-your-zwift-click-firmware-B1IdjkGW6'
		);
		expect(panel).toContain('connection-status-pulse');
		expect(panel).toContain('bg-mint/10');
		expect(panel).not.toContain('shadow-[inset_0_0_18px');
		expect(panel).not.toContain('divide-y');
		const pairingPanel = render(
			<DevicePairingPanel
				browserNotice=""
				click={{
					...common,
					connectedCount: 0,
					connectionActive: true,
					controllers: [],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					pairedCount: 0,
					reconnecting: false,
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={{
					...common,
					busy: true,
					phase: 'pairing',
					status: 'Pairing…',
				}}
			/>
		);
		expect(pairingPanel).toContain('>Cancel pairing</button>');
		expect(pairingPanel).not.toContain('disabled=""');
		const inactiveClickPanel = render(
			<DevicePairingPanel
				browserNotice=""
				click={{
					...common,
					connectedCount: 0,
					connectionActive: false,
					controllers: [
						{
							active: false,
							busy: false,
							connected: false,
							firmwareVersion: '1.1.0',
							id: 'saved-plus-click',
							label: '+ Controller',
							paired: true,
							phase: 'offline',
							reconnecting: false,
							role: 'up',
							status: 'Paired · offline',
						},
					],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					paired: true,
					pairedCount: 1,
					phase: 'offline',
					reconnecting: false,
					status: 'Paired · offline',
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={common}
			/>
		);
		expect(inactiveClickPanel).toContain('Reconnects when the session resumes');
		expect(inactiveClickPanel).not.toContain('>Reconnect</button>');
		expect(inactiveClickPanel).toContain('blue Y button shifts down');
		expect(inactiveClickPanel).toContain(
			'Use firmware 1.2.0. Update it in the Zwift Companion app under Equipment → Zwift Click →'
		);
		expect(inactiveClickPanel).toContain('>Update Firmware</a>.');
		expect(inactiveClickPanel).not.toContain('Zwift firmware instructions');
		expect(inactiveClickPanel).toContain(
			'https://support.zwift.com/updating-your-zwift-click-firmware-B1IdjkGW6'
		);
		expect(inactiveClickPanel.match(/>Pair<\/button>/g)).toHaveLength(2);
		const configuredPanel = render(
			<DevicePairingPanel
				automaticReconnectConfigured
				browserNotice=""
				click={{
					...common,
					connectedCount: 0,
					connectionActive: true,
					controllers: [],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					pairedCount: 0,
					reconnecting: false,
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={common}
			/>
		);
		expect(configuredPanel).toContain('Automatic reconnect is configured correctly');
		expect(configuredPanel).not.toContain(CHROME_BLUETOOTH_FLAGS_URL);
		expect(configuredPanel).not.toContain('Use the new permissions backend for Web Bluetooth');
		const unsupportedPanel = render(
			<DevicePairingPanel
				browserNotice="Bluetooth does not work in Brave. Chrome is currently the only browser tested with Ride Control."
				click={{
					...common,
					connectedCount: 0,
					connectionActive: true,
					controllers: [],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					pairedCount: 0,
					reconnecting: false,
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={common}
			/>
		);
		expect(unsupportedPanel).toContain('Bluetooth does not work in Brave');
		expect(unsupportedPanel).not.toContain('Automatic reconnect in Chrome');
		expect(unsupportedPanel).not.toContain(
			'chrome://flags/#enable-web-bluetooth-new-permissions-backend'
		);
		expect(unsupportedPanel).not.toContain('Smart trainer');
		expect(unsupportedPanel).not.toContain('Heart rate');
		expect(unsupportedPanel).not.toContain('Zwift Click V2');
	});

	test('renders a focused 1–24 gear control', () => {
		const html = render(
			<GearControl
				disabled={false}
				gear={12}
				maximumGear={24}
				onChange={() => undefined}
				shiftFlash="increase"
			/>
		);
		expect(html).toContain('data-gear-control="true"');
		expect(html).toContain('Shift to an easier gear');
		expect(html).toContain('Shift to a harder gear');
		expect(html).toContain('EASIER');
		expect(html).toContain('HARDER');
		expect(html).toContain('grid h-9 w-9 shrink-0 place-items-center rounded-lg');
		expect(html).toContain('scale-105 border-mint bg-mint/15 text-mint');
		expect(html).not.toContain('Connect the trainer before shifting gears.');
		const disabled = render(
			<GearControl disabled gear={12} maximumGear={24} onChange={() => undefined} />
		);
		expect(disabled).not.toContain('Connect the trainer before shifting gears.');
		expect(disabled.match(/disabled=""/g)).toHaveLength(2);
	});

	test('renders only the selected training control mode', () => {
		const gear = render(
			<TrainingControl
				connected
				control={{
					gear: 12,
					maximumGear: 24,
					mode: 'gear',
					onShift: () => undefined,
				}}
			/>
		);
		expect(gear).toContain('Virtual shifting');
		expect(gear).toContain('of 24');
		expect(gear).not.toContain('to shift');
		expect(gear).not.toContain('Resistance control');

		const resistance = render(
			<TrainingControl
				connected
				control={{
					mode: 'resistance',
					onChange: () => undefined,
					ramp: { current: 40, from: 40, phase: 'holding', progress: 0, to: 40 },
					resistance: 40,
				}}
			/>
		);
		expect(resistance).toContain('Resistance control');
		expect(resistance).not.toContain('Virtual shifting');
	});

	test('renders terrain workout selection, progress, and automatic resistance', () => {
		const [course] = WORKOUT_COURSES;
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const panel = render(
			<WorkoutPanel
				courses={WORKOUT_COURSES}
				customCourseIds={noCustomWorkoutIds}
				focusedCourseId={course.id}
				onClose={() => undefined}
				onImportCourse={() => Promise.reject(new Error('Not used in this render test'))}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onRenameCourse={() => course}
				onReorderCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked={false}
				speedUnit="mph"
			/>
		);
		expect(panel).toContain('Terrain workouts');
		expect(panel).toContain('data-focused="true"');
		expect(panel).toContain(`id="workout-${course.id}"`);
		expect(panel).toContain('Harbor Ring');
		expect(panel).toContain('Prairie Roll');
		expect(panel).toContain('Cedar Circuit');
		expect(panel).toContain('Highland Loop');
		expect(panel).toContain('Granite Switchbacks');
		expect(panel).toContain('Ridgeline Time Trial');
		expect(panel).toContain('Harbor Ring course map');
		expect(panel).toContain('Harbor Ring elevation profile');
		expect(panel).toContain('Import GPX');
		expect(panel).toContain('Browse BikeGPX');
		expect(panel).toContain('Browse thousands of public BikeGPX routes');
		expect(panel).toContain('data-gpx-drop-target="true"');
		expect(panel).toContain('data-testid="workout-list"');
		expect(panel).toContain('placeholder="Search by name or difficulty"');
		expect(panel).toContain('data-testid="workout-status"');
		expect(panel).toContain('role="status"');
		expect(panel).not.toContain('Ride without a workout');
		expect(panel).not.toContain(
			'Choose a workout for your next session, then start it when you are ready.'
		);
		expect(panel.match(/Download GPX/g)).toHaveLength(6);
		expect(panel).toContain('10.0 mi out &amp; back');
		expect(panel).toContain('15.0 mi loop');
		expect(panel).toContain('repeated gradual climbs and descents');
		expect(panel).toContain('49 ft climbing');
		expect(panel).not.toContain('15 m climbing');
		expect(panel).toContain('stroke="#64748b"');
		expect(panel).toContain('bg-slate-800/70');
		expect(panel).not.toContain('bg-lime text-ink');
		expect(panel).not.toContain('aria-label="Rename Harbor Ring"');
		expect(panel).toContain('aria-label="Drag Harbor Ring to reorder"');
		expect(panel).toContain('<title>Move workout up or down</title>');
		expect(panel).toContain('absolute top-3 right-3');
		expect(panel).not.toContain('draggable="true"');
		expect(panel.match(/aria-label="Drag [^"]+ to reorder"/g)).toHaveLength(6);
		expect(panel.match(/data-workout-drop-index=/g)).toHaveLength(7);
		expect(panel).not.toContain('bg-cyan-400/20');
		expect(panel).not.toContain('shadow-[0_0_10px_rgba(103,232,249,.8)]');
		expect(panel).not.toContain('Move dragged workout to');
		expect(panel).not.toContain('ring-2 ring-cyan-400/70');
		expect(panel).not.toContain('View map');
		expect(panel).toContain('data-side-tray="true"');
		const importedCourse = {
			...course,
			description: 'Australia · Bright → Near Hotham Heights — 26 km',
			descriptionAttribution: WORKOUT_DESCRIPTION_ATTRIBUTION.OPENSTREETMAP,
			id: 'imported-course',
			name: 'Imported course',
			routeType: WORKOUT_ROUTE_TYPE.POINT_TO_POINT,
			startingLocation: 'Ålands Countryside',
		};
		const customPanel = render(
			<WorkoutPanel
				courses={[...WORKOUT_COURSES, importedCourse]}
				customCourseIds={new Set([importedCourse.id])}
				onClose={() => undefined}
				onImportCourse={() => Promise.reject(new Error('Not used in this render test'))}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onRenameCourse={() => importedCourse}
				onReorderCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked={false}
				speedUnit="mph"
			/>
		);
		expect(customPanel).toContain('Imported course');
		expect(customPanel).toContain('Australia · Bright → Near Hotham Heights');
		expect(customPanel).not.toContain('Near Hotham Heights —');
		expect(customPanel).toContain('title="View the route map"');
		expect(customPanel).toContain('target="_blank"');
		expect(customPanel).toContain('© OpenStreetMap contributors');
		expect(customPanel.indexOf('© OpenStreetMap contributors')).toBeGreaterThan(
			customPanel.indexOf('point to point')
		);
		expect(customPanel).toContain('aria-label="Rename Imported course"');
		expect(customPanel).toContain('title="Rename imported workout"');
		expect(customPanel).toContain('Imported');
		expect(customPanel).toContain('point to point');
		expect(customPanel).not.toContain('?workout-map=');
		expect(customPanel).not.toContain('View map');
		expect(customPanel).toContain('Remove');
		expect(customPanel.match(/Download GPX/g)).toHaveLength(7);
		const renameDialog = render(
			<RenameWorkoutDialog
				course={importedCourse}
				onClose={() => undefined}
				onRename={() => undefined}
			/>
		);
		expect(renameDialog).toContain('Rename workout');
		expect(renameDialog).not.toContain('IMPORTED GPX');
		expect(renameDialog).not.toContain(
			'The route and its duplicate-detection identifier will stay the same.'
		);
		expect(renameDialog).toContain('value="Imported course"');
		expect(renameDialog).toContain('Save name');
		const lockedPanel = render(
			<WorkoutPanel
				activeCourse={course}
				courses={WORKOUT_COURSES}
				customCourseIds={noCustomWorkoutIds}
				onClose={() => undefined}
				onImportCourse={() => Promise.reject(new Error('Not used in this render test'))}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onRenameCourse={() => course}
				onReorderCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked
				speedUnit="mph"
			/>
		);
		expect(lockedPanel).toContain('placeholder="Search by name or difficulty"');
		expect(lockedPanel.match(/disabled=""/g)).toHaveLength(6);
		expect(lockedPanel).not.toContain('Clear selected workout');
		const selectedPanel = render(
			<WorkoutPanel
				activeCourse={course}
				courses={WORKOUT_COURSES}
				customCourseIds={noCustomWorkoutIds}
				onClose={() => undefined}
				onImportCourse={() => Promise.reject(new Error('Not used in this render test'))}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onRenameCourse={() => course}
				onReorderCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked={false}
				speedUnit="mph"
			/>
		);
		expect(selectedPanel).toContain('Clear selected workout');
		expect(selectedPanel).not.toContain('Ride without a workout');

		const terrain = workoutTerrainAtDistance(course, course.distance * 2 + 2);
		const shiftedWorkoutResistance = 42.4;
		const progress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding
				speedUnit="mph"
				targetResistance={shiftedWorkoutResistance}
				terrain={terrain}
				workout={{ course }}
			/>
		);
		expect(progress).not.toContain('Terrain workout');
		expect(progress).not.toContain('Current lap');
		expect(progress).toContain('Laps completed');
		expect(progress).toContain('aria-label="2 laps completed"');
		expect(progress).toContain('Course map');
		expect(progress).toContain('1.24 / 3.98 mi');
		expect(progress).toContain('Elevation profile');
		expect(progress).toContain('Course climb');
		expect(progress).toContain('49 ft');
		expect(progress).toContain('Climbed');
		expect(progress).toContain('98 ft');
		expect(progress).toContain('Downhill');
		expect(progress).toContain('39 ft');
		expect(progress).toContain('Progress');
		expect(progress).toContain(`${Math.round(terrain.progress * 100)}%`);
		expect(progress).toContain('Grade');
		expect(progress).toContain(formatGrade(terrain.grade));
		expect(progress).toContain('style="color:#e879f9"');
		expect(progress).toContain('Resistance');
		expect(progress).toContain(`${Math.round(shiftedWorkoutResistance)}%`);
		expect(progress).toContain('style="color:#2dd4bf"');
		expect(progress).not.toContain(`${terrain.resistance}%`);
		expect(progress.match(/sm:text-4xl/g)).toHaveLength(3);
		expect(progress.match(/sm:text-2xl/g)).toHaveLength(3);
		expect(progress).toContain('sm:text-lg');
		expect(progress.match(/px-4 pt-4 pb-2 sm:px-5 sm:pt-5/g)).toHaveLength(2);
		expect(progress.match(/mt-1 h-36/g)).toHaveLength(2);
		expect(progress).toContain('Ridden this lap');
		expect(progress.match(/functional-status-pulse/g)).toHaveLength(2);
		expect(progress).toContain('data-profile-marker="true"');
		expect(progress).not.toContain('rgba(173, 245, 189, .2)');
		expect(progress.match(/data-route-progress="true"/g)).toHaveLength(2);
		expect(progress).not.toContain('stroke-dasharray');
		expect(progress).not.toContain('Terrain resistance');
		const metricProgress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding={false}
				speedUnit="kmh"
				terrain={terrain}
				workout={{ course }}
			/>
		);
		expect(metricProgress).toContain('15 m');
		expect(metricProgress).toContain('30 m');
		expect(metricProgress).toContain('12 m');
		expect(metricProgress).not.toContain('functional-status-pulse');
		const pointToPointProgress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding={false}
				speedUnit="mph"
				terrain={terrain}
				workout={{ course: importedCourse }}
			/>
		);
		expect(pointToPointProgress).toContain('Route completed');
		expect(pointToPointProgress).toContain('Ridden this route');
		expect(pointToPointProgress).toContain('aria-label="2 routes completed"');
	});

	test('hides empty notifications and expands setup guidance', () => {
		expect(
			render(<Notification connected={false} notice="" onDismiss={() => undefined} />)
		).toBe('');
		const notice = render(
			<Notification connected notice="Trainer connected." onDismiss={() => undefined} />
		);
		expect(notice).toContain('flex items-center gap-3');
		expect(notice).toContain('role="timer"');
		expect(notice).toContain('15 seconds remaining');
		const html = render(
			<Notification
				connected={false}
				notice={CHROME_BLUETOOTH_PERMISSION_MESSAGE}
				onDismiss={() => undefined}
			/>
		);
		expect(html).toContain('15 seconds remaining');
		expect(html).toContain('persistent Bluetooth permissions');
		expect(html).toContain('chrome://flags/');
	});

	test('composes the application dashboard', async () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: () => null,
				removeItem: () => undefined,
				setItem: () => undefined,
			},
		});
		const html = await renderApp();
		expect(html).toContain('Resistance control');
		expect(html).not.toContain('Import GPX');
		expect(html).toContain('Pair devices');
		expect(html).toContain('Sessions');
		expect(html).toContain('Show keyboard controls');
		expect(html).toContain('Ride Control');
		expect(html).toContain('href="https://github.com/RideControlOrg/RideControl"');
		expect(html).toContain('href="https://github.com/sponsors/lookfirst"');
		expect(html).toContain('href="mailto:hello@ridecontrol.xyz"');
		expect(html).toContain('>Contact</a>');
		expect(html).toContain('>Privacy</button>');
		expect(html).toContain('>Terms</button>');
		expect(html).toContain('>Version</button>');
		expect(html).toContain('Sponsor');
		expect(html.indexOf('href="https://github.com/sponsors/lookfirst"')).toBeLessThan(
			html.indexOf('href="mailto:hello@ridecontrol.xyz"')
		);
		expect(html).not.toContain('WELCOME TO');
		expect(html).toContain('show again');
		expect(html).toContain('border-slate-700/70 border-t');
		expect(html).toContain('text-slate-500 text-xs');
		expect(html).toContain('type="button">Ride Control</button>');
		expect(html).toContain('type="button">Profile</button>');
		expect(html.indexOf('type="button">Sessions</button>')).toBeLessThan(
			html.indexOf('type="button">Profile</button>')
		);
		expect(html.indexOf('type="button">Profile</button>')).toBeLessThan(
			html.indexOf('aria-label="Show keyboard controls"')
		);
		expect(html.slice(html.indexOf('<footer')).includes('>Profile</button>')).toBeFalse();
		expect(html).toContain('mx-auto w-full min-w-0 max-w-7xl flex-1 px-3 py-3');
		expect(html).toContain('mb-4 flex flex-wrap items-center justify-between gap-3');
		expect(html).toContain('mt-4 grid min-w-0 gap-4 *:min-w-0');
		expect(html).toContain('pb-[max(0.75rem,env(safe-area-inset-bottom))]');
		expect(html).not.toContain('fixed right-4 bottom-3 left-4');
		expect(html).toContain('rounded-2xl border border-line bg-panel p-4');
		expect(html).toContain('xl:grid-cols-[1.45fr_.55fr]');
		expect(html).not.toContain('>KM/H</button>');
		expect(html).not.toContain('>MPH</button>');
		expect(html).toMatch(enabledEndSessionButton);
	});

	test('renders version details in an accessible dialog', () => {
		expect(render(<BuildDetailsDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(
			<BuildDetailsDialog
				onClose={() => undefined}
				open
				pullRequests={[
					{
						mergedAt: '2026-07-22T19:30:00Z',
						number: 42,
						title: 'Improve production build details',
						url: 'https://github.com/RideControlOrg/RideControl/pull/42',
					},
				]}
			/>
		);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('Version details');
		expect(html).not.toContain('Current build');
		expect(html).not.toContain(
			'These details identify the frontend bundle currently running in your browser.'
		);
		expect(html).toContain('Build ID');
		expect(html).toContain('UTC timestamp');
		expect(html).toContain('View source build on GitHub');
		expect(html).toContain('Recent changes');
		expect(html).toContain('Latest merged PR');
		expect(html).toContain('Improve production build details');
		expect(html).toContain('href="https://github.com/RideControlOrg/RideControl/pull/42"');
		expect(html).toContain('<time dateTime="2026-07-22T19:30:00Z">');
		expect(html).toContain(
			'href="https://github.com/RideControlOrg/RideControl/pulls?q=is%3Apr+is%3Aclosed"'
		);
		expect(html).toContain('aria-label="Close version details"');
		expect(
			render(<BuildDetailsDialog onClose={() => undefined} open pullRequests={[]} />)
		).toContain('Recent pull requests are included in production builds.');
	});

	test('renders the privacy policy in an accessible dialog', () => {
		expect(render(<PrivacyPolicyDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(<PrivacyPolicyDialog onClose={() => undefined} open />);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('Privacy Policy');
		expect(html).toContain('Effective July 23, 2026');
		expect(html).toContain('Ride Control does not create an account');
		expect(html).toContain('does not use advertising or behavioral analytics cookies');
		expect(html).toContain('href="mailto:hello@ridecontrol.xyz"');
		expect(html).toContain('aria-label="Close privacy policy"');
	});

	test('renders the terms of service in an accessible dialog', () => {
		expect(render(<TermsOfServiceDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(<TermsOfServiceDialog onClose={() => undefined} open />);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('Terms of Service');
		expect(html).toContain('Effective July 23, 2026');
		expect(html).toContain('Ride Control does not provide medical advice');
		expect(html).toContain('Bluetooth devices, trainers, sensors, and browsers vary');
		expect(html).toContain('href="mailto:hello@ridecontrol.xyz"');
		expect(html).toContain('frontend source code is available on GitHub');
		expect(html).toContain('href="https://github.com/RideControlOrg/RideControl"');
		expect(html).toContain('The backend component is closed source');
		expect(html).toContain('optional paid additions');
		expect(html).toContain('aria-label="Close terms of service"');
	});

	test('renders an inclusive local profile editor', () => {
		const profile = {
			bikeWeightKg: 9,
			frontChainringTeeth: [53, 39],
			identity: '',
			name: 'Riley',
			rearCassetteTeeth: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24],
			riderWeightKg: 75,
		};
		expect(
			render(
				<ProfileDialog
					onClose={() => undefined}
					onSave={async () => undefined}
					onSelectSpeedUnit={() => undefined}
					open={false}
					physicsSettingsLocked={false}
					profile={profile}
					speedUnit="mph"
					storageError=""
				/>
			)
		).toBe('');
		const html = render(
			<ProfileDialog
				onClose={() => undefined}
				onSave={async () => undefined}
				onSelectSpeedUnit={() => undefined}
				open
				physicsSettingsLocked={false}
				profile={profile}
				speedUnit="mph"
				storageError=""
			/>
		);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('id="profile-title">Profile</h2>');
		expect(html).toContain('Choose profile image');
		expect(html).toContain('Sex or gender identity');
		expect(html).toContain('value="Non-binary"');
		expect(html).toContain('value="Two-Spirit"');
		expect(html).toContain('never used in workout calculations');
		expect(html).toContain('Display units');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('>KM/H</button>');
		expect(html).toContain('>MPH</button>');
		expect(html).toContain('Controls speed, distance, elevation, and weight units.');
		expect(html).toContain('Your weight (lb)');
		expect(html).toContain('Bike weight (lb)');
		expect(html).toContain('value="53/39"');
		expect(html).toContain('This setup creates 24 virtual gears');
		expect(html).toContain('IndexedDB');
		expect(html).toContain('aria-label="Close profile"');
		const lockedHtml = render(
			<ProfileDialog
				onClose={() => undefined}
				onSave={async () => undefined}
				onSelectSpeedUnit={() => undefined}
				open
				physicsSettingsLocked
				profile={profile}
				speedUnit="mph"
				storageError=""
			/>
		);
		expect(lockedHtml).toContain('Weight and drivetrain settings are locked');
		expect(lockedHtml).toContain('id="profile-rider-weight"');
		expect(lockedHtml).toContain('disabled=""');
	});

	test('shows manual virtual shifting for a terrain workout without Click controllers', async () => {
		const [course] = WORKOUT_COURSES;
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const html = await renderApp({
			...emptySession,
			workout: { course },
		});
		expect(html).toContain('Virtual shifting');
		expect(html).toContain('Shift to an easier gear');
		expect(html).toContain('Shift to a harder gear');
		expect(html).not.toContain('Resistance control');
	});

	test('renders the first-time welcome message', () => {
		expect(render(<WelcomeDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(<WelcomeDialog onClose={() => undefined} open />);
		expect(html).toContain('aria-modal="true"');
		expect(html).not.toContain('WELCOME TO');
		expect(html).toContain('RideControl.xyz');
		expect(html).toContain('show again');
		expect(html).toContain('Get started');
		expect(html).toContain('type="checkbox"');
		expect(html).toContain('open-source GPLv3 application');
		expect(html).toContain('source code on GitHub');
		expect(html).toContain('href="https://github.com/RideControlOrg/RideControl"');
		expect(html).toContain('all ride data stays in your browser');
		expect(html).toContain('We don&#x27;t upload it anywhere');
		expect(html).toContain('would only upload data with your permission');
		expect(html).toContain(
			'From the history, you can download your rides as Strava-compatible FIT files'
		);
	});

	test('renders the keyboard controls reference', () => {
		expect(render(<KeyboardShortcutsDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(<KeyboardShortcutsDialog onClose={() => undefined} open />);
		expect(html).toContain('Keyboard controls');
		expect(html).toContain('Open session history');
		expect(html).toContain('End the current session');
		expect(html).toContain('Start a new session after ending');
		expect(html).toContain('Increase or decrease resistance');
		expect(html).toContain('Change the chart view');
		expect(html).toContain('SESSION');
		expect(html).toContain('RIDE CONTROLS');
		expect(html).toContain('GENERAL');
		const historyHtml = render(
			<KeyboardShortcutsDialog
				onClose={() => undefined}
				open
				shortcuts={historyKeyboardShortcuts}
				title="History keyboard controls"
			/>
		);
		expect(historyHtml).toContain('History keyboard controls');
		expect(historyHtml).toContain('Select the previous or next session');
		expect(historyHtml).toContain('Change the session chart view');
		expect(historyHtml).toContain('Delete the selected session');
		expect(historyHtml).toContain('Confirm session deletion');
		expect(historyHtml).toContain('NAVIGATION');
		expect(historyHtml).toContain('SESSION');
		expect(historyHtml).toContain('GENERAL');
		expect(historyHtml).not.toContain('Increase or decrease resistance');
		expect(historyHtml).not.toContain('Pause or resume');
		expect(historyHtml).not.toContain('Start a new session after ending');
	});

	test('graphs resistance with the other session data', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: () => null,
				setItem: () => undefined,
			},
		});
		const html = render(
			<SessionChart
				controlMode="resistance"
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						heartRate: 140,
						power: 180,
						resistance: 42,
						speed: 30,
					},
				]}
				route={[]}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Resistance over time');
		expect(html).toContain('Resistance</button>');
		expect(html).not.toContain('Gear over time');
		expect(html).not.toContain('Gear</button>');
		expect(html).toContain('grid-cols-[3rem_minmax(0,1fr)]');
		expect(html).toContain('absolute right-1 -translate-y-1/2 whitespace-nowrap sm:right-2');
		expect(html).toContain('pointer-events-none relative h-full w-12 shrink-0');
		expect(html).toContain('h-full min-w-0 flex-1 overflow-hidden');
		expect(html).toContain('class="block h-full w-full"');
		expect(html).toContain('scrollbar-hidden flex w-full gap-1 overflow-x-auto');
		expect(html).toContain('min-w-max flex-1');
		expect(html).toContain('h-1.5 w-1.5 shrink-0 rounded-full');
		expect(html).toContain('text-[11px] transition sm:text-[13px]');
		expect(html).toContain(
			'mt-4 min-w-0 overflow-hidden rounded-xl border border-line bg-[#12171d] p-2 sm:mt-6 sm:p-4'
		);
		expect(html).toMatch(solidChartBoundaries);
		expect(html).toMatch(dashedChartGuides);
		expect(html.match(/data-chart-separator="true"/g)).toHaveLength(4);
		expect(html.match(/-my-3 ml-12 h-6 bg-white\/1\.5 sm:ml-15/g)).toHaveLength(4);
		expect(html).not.toContain('absolute top-[11%] bottom-[8%] left-1');
		const gearModeWithoutSamples = render(
			<SessionChart controlMode="gear" history={[]} route={[]} speedUnit="kmh" />
		);
		expect(gearModeWithoutSamples).toContain('Gear over time');
		expect(gearModeWithoutSamples).toContain('Gear</button>');
	});

	test('supports a chart selection scoped outside the shared dashboard preference', () => {
		const history = [
			{
				cadence: 85,
				elapsedSeconds: 1,
				heartRate: 140,
				power: 180,
				resistance: 42,
				speed: 30,
			},
		];
		const trayChart = render(
			<SessionChart
				history={history}
				onSelectChartMode={() => undefined}
				route={[]}
				selectedChartMode="power"
				speedUnit="kmh"
			/>
		);
		expect(trayChart).toContain('Power over time');
		expect(trayChart).not.toContain('Speed over time');
		expect(trayChart).not.toContain('Cadence over time');
	});

	test('graphs recorded workout elevation with a distinct color', () => {
		const [course] = WORKOUT_COURSES;
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const html = render(
			<SessionChart
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						elevation: 24,
						grade: 3.2,
						heartRate: 140,
						power: 180,
						resistance: 42,
						speed: 30,
					},
				]}
				route={course.points}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Elevation over time');
		expect(html).toContain('Elevation</button>');
		expect(html).toContain('28 m');
		expect(html).toContain('stroke="#fb923c"');
		expect(html).toContain('Grade over time');
		expect(html).toContain('Grade</button>');
		expect(html).toContain('stroke="#e879f9"');
		expect(html).toContain('stroke="#2dd4bf"');
		expect(html.match(/data-chart-separator="true"/g)).toHaveLength(6);
		const imperialHtml = render(
			<SessionChart
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						elevation: 24,
						heartRate: 140,
						power: 180,
						resistance: 42,
						speed: 30,
					},
				]}
				route={course.points}
				speedUnit="mph"
			/>
		);
		expect(imperialHtml).toContain('92 ft');
		expect(imperialHtml).not.toContain('28 m');
	});

	test('preserves gear and applied resistance graphs after returning to resistance control', () => {
		const html = render(
			<SessionChart
				controlMode="resistance"
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						gear: 14,
						heartRate: 140,
						power: 180,
						resistance: 36,
						speed: 30,
					},
				]}
				route={[]}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Gear over time');
		expect(html).toContain('Gear</button>');
		expect(html).toContain('Resistance over time');
		expect(html).toContain('Resistance</button>');
	});

	test('renders the session save workflow', () => {
		expect(
			render(
				<SessionSaveDialog
					intent={SESSION_WORKFLOW_INTENT.END}
					onClose={() => undefined}
					onSave={async () => undefined}
					onStartWithoutSaving={() => undefined}
					open={false}
					saving={false}
					session={{ ...emptySession, maximums: emptyMetrics }}
					speedUnit="kmh"
				/>
			)
		).toBe('');
		const html = render(
			<SessionSaveDialog
				intent={SESSION_WORKFLOW_INTENT.CONTINUE}
				onClose={() => undefined}
				onSave={async () => undefined}
				onStartWithoutSaving={() => undefined}
				open
				saving={false}
				session={{
					aggregates: emptySession.aggregates,
					calories: 100,
					controlMode: 'resistance',
					distance: 10,
					elapsedSeconds: 3600,
					elevationTotals: emptySession.elevationTotals,
					endedAt: Date.now(),
					history: [],
					maximums: emptyMetrics,
					startedAt: Date.now(),
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Save this session?');
		expect(html).not.toContain('SESSION ENDED');
		expect(html).toContain('How did it feel?');
		expect(html).toContain('Continue without saving');
		expect(html).toContain('Save &amp; continue');
		const endSession = render(
			<SessionSaveDialog
				intent={SESSION_WORKFLOW_INTENT.END}
				onClose={() => undefined}
				onSave={async () => undefined}
				onStartWithoutSaving={() => undefined}
				open
				saving={false}
				session={{ ...emptySession, maximums: emptyMetrics }}
				speedUnit="kmh"
			/>
		);
		expect(endSession).toContain('End without saving');
		expect(endSession).toContain('Save session');
		const newSession = render(
			<SessionSaveDialog
				intent={SESSION_WORKFLOW_INTENT.NEW}
				onClose={() => undefined}
				onSave={async () => undefined}
				onStartWithoutSaving={() => undefined}
				open
				saving={false}
				session={{ ...emptySession, maximums: emptyMetrics }}
				speedUnit="kmh"
			/>
		);
		expect(newSession).toContain('Start new without saving');
		expect(newSession).toContain('Save &amp; start new');
	});

	test('places workout planning after starting a new session', () => {
		const html = render(
			<SessionControls
				ended
				isRiding={false}
				manuallyPaused={false}
				onEnd={() => undefined}
				onOpenWorkouts={() => undefined}
				onRequestNew={() => undefined}
				onSave={() => undefined}
				onTogglePause={() => undefined}
				saveResolved
				workoutSelectionLocked={false}
			/>
		);
		expect(html.indexOf('Start new session')).toBeLessThan(html.indexOf('Workouts'));
	});

	test('renders an empty session history', () => {
		const html = render(
			<SessionHistory
				onClose={() => undefined}
				onStartNew={() => undefined}
				open
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Sessions');
		expect(html).toContain('0 sessions');
		expect(html).not.toContain('Saved on this device');
		expect(html).toContain('data-side-tray="true"');
		expect(html).toContain('No saved sessions yet');
		expect(html).toContain('data-testid="session-list"');
		expect(html).toContain('min-h-0 min-w-0 flex-1 flex-col overflow-hidden');
		expect(html).toContain('overflow-y-auto overflow-x-hidden');
		expect(html).toContain('Import FIT/TCX');
		expect(html).toContain('data-testid="download-all-sessions"');
		expect(html).toContain('aria-label="Download all sessions as FIT"');
		expect(html).toContain('aria-label="Download all format"');
		expect(html).toContain('Download all');
		expect(html).toContain('.tcx,.zip');
		expect(html).toContain('End a session or import a FIT or TCX file to add it here.');
		expect(html).toContain('ml-auto');
		expect(html).toContain('translate-x-0');
		expect(html).toContain('Show history keyboard controls');
		expect(html).toContain('absolute top-3 right-14 grid h-9 w-9');
		expect(html).toContain('absolute top-3 right-3 grid h-9 w-9');
		expect(html.match(/hover:text-white sm:static/g)).toHaveLength(2);
	});

	test('virtualizes a large session history list', () => {
		const summaries = Array.from({ length: 100 }, (_, index) => ({
			...sessionSummary({
				...savedSessionFixture,
				endedAt: savedSessionFixture.endedAt - index * 1000,
				id: `session-${index}`,
				startedAt: savedSessionFixture.startedAt - index * 1000,
			}),
			workoutName: `Workout ${index}`,
		}));
		const html = render(
			<SessionHistoryList
				error=""
				highlightedSessionIds={[]}
				onLoadMore={() => undefined}
				onSelect={() => undefined}
				open
				selectedId={summaries[0]?.id}
				speedUnit="kmh"
				summaries={summaries}
				total={summaries.length}
			/>
		);
		const renderedSessionCount = html.match(/aria-pressed=/g)?.length ?? 0;
		expect(html).toContain('data-session-history-virtualized="true"');
		expect(html).toContain('Workout 0');
		expect(renderedSessionCount).toBeGreaterThan(0);
		expect(renderedSessionCount).toBeLessThan(summaries.length);
		expect(html).not.toContain('Workout 99');
	});

	test('highlights every session from the latest import in history navigation', () => {
		const importedSession = { ...savedSessionFixture, importedAt: Date.UTC(2026, 6, 19) };
		const html = render(
			<SessionHistoryList
				error=""
				highlightedSessionIds={[importedSession.id]}
				onLoadMore={() => undefined}
				onSelect={() => undefined}
				open
				selectedId={importedSession.id}
				speedUnit="kmh"
				summaries={[sessionSummary(importedSession)]}
				total={1}
			/>
		);
		expect(html).toContain('aria-label="Imported from activity file"');
		expect(html).toContain('<title>Imported from activity file</title>');
		expect(html).toContain('absolute right-2.5 bottom-3');
		expect(html).toContain('class="h-5 w-5"');
		expect(html).toContain('ring-cyan-400/70');
		expect(html).toContain('shadow-[0_0_14px_rgba(34,211,238,0.16)]');
	});

	test('labels imported sessions permanently without retaining the fresh highlight', () => {
		const importedSession = { ...savedSessionFixture, importedAt: Date.UTC(2026, 6, 19) };
		const list = render(
			<SessionHistoryList
				error=""
				highlightedSessionIds={[]}
				onLoadMore={() => undefined}
				onSelect={() => undefined}
				open
				speedUnit="kmh"
				summaries={[sessionSummary(importedSession)]}
				total={1}
			/>
		);
		expect(list).toContain('aria-label="Imported from activity file"');
		expect(list).not.toContain('>Imported<');
		expect(list).not.toContain('ring-cyan-400/70');
		const detail = render(<SessionDetail session={importedSession} speedUnit="kmh" />);
		expect(detail).toContain('data-testid="session-detail"');
		expect(detail).toContain('overflow-y-auto overflow-x-hidden');
		expect(detail).toContain('>Imported<');
		expect(detail).not.toContain('Imported TCX');
		expect(detail).toContain('MAX</strong>45');
		expect(detail).toContain(
			`title="Imported ${formatSessionImportTime(importedSession.importedAt)}`
		);
	});

	test('renders session deletion confirmation as a modal', () => {
		const html = render(
			<DeleteSessionDialog
				deleting={false}
				onCancel={() => undefined}
				onConfirm={() => undefined}
				open
			/>
		);
		expect(html).toContain('role="alertdialog"');
		expect(html).toContain('Delete this session?');
		expect(html).toContain('Delete permanently');
		expect(html).toContain('absolute top-0 right-0');
		expect(html).not.toContain('bg-black/65');
		expect(
			render(
				<DeleteSessionDialog
					deleting
					onCancel={() => undefined}
					onConfirm={() => undefined}
					open
				/>
			)
		).toContain('Deleting…');
		expect(
			render(
				<DeleteSessionDialog
					deleting={false}
					onCancel={() => undefined}
					onConfirm={() => undefined}
					open={false}
				/>
			)
		).toBe('');
	});

	test('renders an overnight session with date and time ranges', () => {
		const startedAt = new Date(2026, 6, 18, 23).getTime();
		const endedAt = new Date(2026, 6, 19, 1).getTime();
		const html = render(
			<SessionDetail
				session={{
					aggregates: emptySession.aggregates,
					calories: 0,
					comments: '',
					controlMode: 'resistance',
					distance: 0,
					elapsedSeconds: 7200,
					elevationTotals: emptySession.elevationTotals,
					endedAt,
					history: [],
					id: 'overnight-session',
					maximums: emptyMetrics,
					startedAt,
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain(
			new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).formatRange(
				new Date(startedAt),
				new Date(endedAt)
			)
		);
		expect(html).toContain('11:00pm – 1:00am');
	});

	test('styles an unrecorded feeling like the comments value', () => {
		const html = render(
			<SessionDetail
				deleteConfirmationOpen
				onCancelDelete={() => undefined}
				onConfirmDelete={() => undefined}
				onDelete={() => undefined}
				onStartNew={() => undefined}
				session={{
					aggregates: emptySession.aggregates,
					calories: 0,
					comments: '',
					controlMode: 'resistance',
					distance: 0,
					elapsedSeconds: 0,
					elevationTotals: emptySession.elevationTotals,
					endedAt: Date.now(),
					history: [],
					id: 'empty-session',
					maximums: emptyMetrics,
					startedAt: Date.now(),
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('FELT');
		expect(html).toContain('Delete session');
		expect(html).toContain('Start new session');
		expect(html).toContain('Download TCX');
		expect(html).toContain('Download FIT');
		expect(html).toContain('No recorded samples to export');
		expect(html).toContain('role="alertdialog"');
		expect(html).not.toContain('until');
		expect(html).toContain(
			'<p class="mt-1 whitespace-pre-wrap text-slate-300 text-sm">Not recorded</p>'
		);
	});

	test('shows gear instead of resistance in a virtual shifting session summary', () => {
		const html = render(
			<SessionDetail
				session={{
					aggregates: {
						...emptySession.aggregates,
						gear: { count: 2, maximum: 14, sum: 27 },
					},
					calories: 0,
					comments: '',
					controlMode: 'gear',
					distance: 0,
					elapsedSeconds: 2,
					elevationTotals: emptySession.elevationTotals,
					endedAt: Date.now(),
					history: [],
					id: 'gear-session',
					maximums: emptyMetrics,
					startedAt: Date.now() - 2000,
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('GEAR');
		expect(html).toContain('MAX</strong>14');
		expect(html).not.toContain('RESISTANCE');
	});
});
