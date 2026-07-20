import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/app';
import { ConnectionControl } from '../src/components/connection-control';
import { DevicePairingButton, DevicePairingPanel } from '../src/components/device-pairing';
import { GearControl } from '../src/components/gear-control';
import { Icon } from '../src/components/icon';
import { KeyboardShortcutsDialog } from '../src/components/keyboard-shortcuts-dialog';
import { Metric, SessionMetric, SmallMetric } from '../src/components/metrics';
import { Notification } from '../src/components/notification';
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
import { WORKOUT_ROUTE_TYPE } from '../src/lib/workout-schema';
import { WORKOUT_COURSES, workoutTerrainAtDistance } from '../src/lib/workouts';
import { savedSessionFixture } from './fixtures/saved-session';

const render = (element: React.ReactNode) => renderToStaticMarkup(element);
const enabledEndSessionButton = /<button(?![^>]*disabled)[^>]*>End session<\/button>/;
const solidChartBoundaries =
	/d="M0 14H100 M0 90H100"[^>]*stroke="#3a4654"(?![^>]*stroke-dasharray)/;
const dashedChartGuides =
	/d="M0 52H100 M25 14V90 M50 14V90 M75 14V90"[^>]*stroke-dasharray="2.5 2.5"/;
const noCustomWorkoutIds = new Set<string>();

describe('view components', () => {
	test('renders known and fallback icons', () => {
		expect(render(<Icon name="heart" />)).toContain('<title>heart</title>');
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
		expect(render(<SmallMetric label="TIME" large value="01:02:03" />)).toContain(
			'text-3xl sm:text-5xl'
		);
		const distance = render(<SmallMetric label="DISTANCE" large unit="mi" value="10.00" />);
		expect(distance).toContain('>10.00</span>');
		expect(distance).toContain('text-base sm:text-xl');
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
					controllers: [
						{
							active: false,
							busy: true,
							connected: false,
							id: 'minus-click',
							label: '− Controller',
							paired: true,
							phase: 'reconnecting',
							reconnecting: true,
							status: 'Reconnecting…',
						},
						{
							active: true,
							busy: false,
							connected: false,
							id: 'plus-click',
							label: '+ Controller',
							paired: true,
							phase: 'offline',
							reconnecting: false,
							status: 'Paired · offline',
						},
					],
					onForgetController: () => undefined,
					paired: true,
					pairedCount: 2,
					pairing: false,
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
		expect(panel).not.toContain('>Reconnect</button>');
		expect(panel.match(/<span class="sr-only">Connecting\.\.\.<\/span>/g)).toHaveLength(2);
		expect(panel.match(/connecting-dot/g)).toHaveLength(6);
		expect(panel.match(/connection-status-pulse/g)).toHaveLength(2);
		expect(panel).toContain('shadow-[0_0_16px_rgba(56,189,248,.95)]');
		expect(panel).toContain('Automatic reconnect in Chrome');
		expect(panel).toContain('Chrome needs persistent Bluetooth permissions');
		expect(panel).toContain('chrome://flags/#enable-web-bluetooth-new-permissions-backend');
		expect(panel).toContain('Copy Chrome Bluetooth settings address');
		expect(panel).toContain('Use the new permissions backend for Web Bluetooth');
		expect(panel).toContain('Relaunch Chrome, then pair each device once more.');
		expect(panel).not.toContain('github.com/lookfirst/RideControl#automatic-reconnect');
		expect(panel).toContain('+ Controller');
		expect(panel.indexOf('+ Controller')).toBeLessThan(panel.indexOf('− Controller'));
		expect(panel).toContain('connection-status-pulse');
		expect(panel).toContain('bg-mint/10');
		expect(panel).not.toContain('shadow-[inset_0_0_18px');
		expect(panel).not.toContain('divide-y');
		const configuredPanel = render(
			<DevicePairingPanel
				automaticReconnectConfigured
				browserNotice=""
				click={{
					...common,
					connectedCount: 0,
					controllers: [],
					onForgetController: () => undefined,
					pairedCount: 0,
					pairing: false,
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
					controllers: [],
					onForgetController: () => undefined,
					pairedCount: 0,
					pairing: false,
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
		expect(html).not.toContain('Connect the trainer and controllers before shifting gears.');
		const disabled = render(<GearControl disabled gear={12} onChange={() => undefined} />);
		expect(disabled).not.toContain(
			'Connect the trainer and controllers before shifting gears.'
		);
		expect(disabled).not.toContain('Use Zwift Click');
		expect(disabled.match(/disabled=""/g)).toHaveLength(2);
	});

	test('renders only the selected training control mode', () => {
		const gear = render(
			<TrainingControl
				connected
				control={{ gear: 12, mode: 'gear', onShift: () => undefined }}
			/>
		);
		expect(gear).toContain('Virtual shifting');
		expect(gear).toContain('of 24');
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
				ended={false}
				onClose={() => undefined}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked={false}
				speedUnit="mph"
			/>
		);
		expect(panel).toContain('Terrain workouts');
		expect(panel).toContain('Harbor Ring');
		expect(panel).toContain('Prairie Roll');
		expect(panel).toContain('Cedar Circuit');
		expect(panel).toContain('Highland Loop');
		expect(panel).toContain('Granite Switchbacks');
		expect(panel).toContain('Ridgeline Time Trial');
		expect(panel).toContain('Harbor Ring course map');
		expect(panel).toContain('Harbor Ring elevation profile');
		expect(panel).toContain('Import GPX');
		expect(panel.match(/Download GPX/g)).toHaveLength(6);
		expect(panel).toContain('10.0 mi out &amp; back');
		expect(panel).toContain('15.0 mi loop');
		expect(panel).toContain('15–25% resistance');
		expect(panel).toContain('49 ft climbing');
		expect(panel).not.toContain('15 m climbing');
		expect(panel).toContain('stroke="#64748b"');
		expect(panel).toContain('bg-slate-800/70');
		expect(panel).not.toContain('bg-lime text-ink');
		expect(panel).toContain('data-side-tray="true"');
		const importedCourse = {
			...course,
			id: 'imported-course',
			name: 'Imported course',
			routeType: WORKOUT_ROUTE_TYPE.OUT_AND_BACK,
		};
		const customPanel = render(
			<WorkoutPanel
				courses={[...WORKOUT_COURSES, importedCourse]}
				customCourseIds={new Set([importedCourse.id])}
				ended={false}
				onClose={() => undefined}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked={false}
				speedUnit="mph"
			/>
		);
		expect(customPanel).toContain('Imported course');
		expect(customPanel).toContain('Imported');
		expect(customPanel).toContain('out &amp; back');
		expect(customPanel).toContain('Remove');
		expect(customPanel.match(/Download GPX/g)).toHaveLength(7);
		const lockedPanel = render(
			<WorkoutPanel
				activeCourse={course}
				courses={WORKOUT_COURSES}
				customCourseIds={noCustomWorkoutIds}
				ended={false}
				onClose={() => undefined}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked
				speedUnit="mph"
			/>
		);
		expect(lockedPanel).toContain('End the current session before changing the workout.');
		expect(lockedPanel.match(/disabled=""/g)).toHaveLength(6);

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
		expect(progress).toContain('1.2 / 4 mi');
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
		expect(progress).toContain('Resistance');
		expect(progress).toContain(`${Math.round(shiftedWorkoutResistance)}%`);
		expect(progress).not.toContain(`${terrain.resistance}%`);
		expect(progress.match(/sm:text-4xl/g)).toHaveLength(3);
		expect(progress.match(/sm:text-2xl/g)).toHaveLength(3);
		expect(progress).toContain('sm:text-lg');
		expect(progress).toContain('Ridden this lap');
		expect(progress.match(/animate-pulse/g)).toHaveLength(2);
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
		expect(metricProgress).not.toContain('animate-pulse');
		const outAndBackProgress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding={false}
				speedUnit="mph"
				terrain={terrain}
				workout={{ course: importedCourse }}
			/>
		);
		expect(outAndBackProgress).toContain('Trips completed');
		expect(outAndBackProgress).toContain('Ridden this trip');
		expect(outAndBackProgress).toContain('aria-label="2 trips completed"');
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

	test('composes the application dashboard', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: () => null,
				removeItem: () => undefined,
				setItem: () => undefined,
			},
		});
		const html = render(<App />);
		expect(html).toContain('Resistance control');
		expect(html).not.toContain('Import GPX');
		expect(html).toContain('Pair devices');
		expect(html).toContain('History');
		expect(html).toContain('Show keyboard controls');
		expect(html).toContain('Ride Control');
		expect(html).toContain('Build:');
		expect(html).toContain(
			'href="https://github.com/lookfirst/RideControl/pulls?q=is%3Apr+is%3Aclosed"'
		);
		expect(html).toContain('<time dateTime=');
		expect(html).toContain('href="https://github.com/lookfirst/RideControl"');
		expect(html).toContain('href="https://github.com/sponsors/lookfirst"');
		expect(html).toContain('Sponsor');
		expect(html).toContain('WELCOME TO');
		expect(html).toContain('show again');
		expect(html).toContain('tracking-wide transition hover:text-slate-400');
		expect(html).toContain('type="button">Ride Control</button>');
		expect(html).toContain('xl:grid-cols-[1.45fr_.55fr]');
		expect(html.indexOf('KM/H')).toBeLessThan(html.indexOf('Show keyboard controls'));
		expect(html).toMatch(enabledEndSessionButton);
	});

	test('renders the first-time welcome message', () => {
		expect(render(<WelcomeDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(<WelcomeDialog onClose={() => undefined} open />);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('WELCOME TO');
		expect(html).toContain('RideControl.xyz');
		expect(html).toContain('show again');
		expect(html).toContain('Get started');
		expect(html).toContain('type="checkbox"');
		expect(html).toContain('open-source GPLv3 application');
		expect(html).toContain('source code on GitHub');
		expect(html).toContain('href="https://github.com/lookfirst/RideControl"');
		expect(html).toContain('all ride data stays in your browser');
		expect(html).toContain('We don&#x27;t upload it anywhere');
		expect(html).toContain('would only upload data with your permission');
		expect(html).toContain('From the history, you can download your rides as TCX files');
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
		expect(html).toContain('grid-cols-[3.75rem_minmax(0,1fr)]');
		expect(html).toContain('absolute right-2 -translate-y-1/2 whitespace-nowrap');
		expect(html).toContain('pointer-events-none relative h-full w-15 shrink-0');
		expect(html).toContain('h-full min-w-0 flex-1 overflow-hidden');
		expect(html).toContain('class="block h-full w-full"');
		expect(html).toMatch(solidChartBoundaries);
		expect(html).toMatch(dashedChartGuides);
		expect(html.match(/data-chart-separator="true"/g)).toHaveLength(4);
		expect(html.match(/-my-3 ml-15 h-6 bg-white\/1\.5/g)).toHaveLength(4);
		expect(html).not.toContain('absolute top-[11%] bottom-[8%] left-1');
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
		expect(html.match(/data-chart-separator="true"/g)).toHaveLength(5);
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

	test('graphs gear instead of resistance during virtual shifting', () => {
		const html = render(
			<SessionChart
				controlMode="gear"
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						gear: 14,
						heartRate: 140,
						power: 180,
						speed: 30,
					},
				]}
				route={[]}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Gear over time');
		expect(html).toContain('Gear</button>');
		expect(html).not.toContain('Resistance</button>');
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
		expect(html).toContain('Session history');
		expect(html).toContain('data-side-tray="true"');
		expect(html).toContain('No saved sessions yet');
		expect(html).toContain('Import TCX');
		expect(html).toContain('Download all');
		expect(html).toContain('.tcx,.zip');
		expect(html).toContain('End a session or import a TCX file to add it here.');
		expect(html).toContain('ml-auto');
		expect(html).toContain('translate-x-0');
		expect(html).toContain('Show history keyboard controls');
	});

	test('highlights every session from the latest import in history navigation', () => {
		const importedSession = { ...savedSessionFixture, importedAt: Date.UTC(2026, 6, 19) };
		const html = render(
			<SessionHistoryList
				error=""
				highlightedSessionIds={[importedSession.id]}
				onLoadMore={() => undefined}
				onSelect={() => undefined}
				selectedId={importedSession.id}
				speedUnit="kmh"
				summaries={[sessionSummary(importedSession)]}
				total={1}
			/>
		);
		expect(html).toContain('aria-label="Imported from TCX file"');
		expect(html).toContain('<title>Imported from TCX file</title>');
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
				speedUnit="kmh"
				summaries={[sessionSummary(importedSession)]}
				total={1}
			/>
		);
		expect(list).toContain('aria-label="Imported from TCX file"');
		expect(list).not.toContain('>Imported<');
		expect(list).not.toContain('ring-cyan-400/70');
		const detail = render(<SessionDetail session={importedSession} speedUnit="kmh" />);
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
