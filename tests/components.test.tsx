import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/app';
import { ConnectionControl } from '../src/components/connection-control';
import { Icon } from '../src/components/icon';
import { KeyboardShortcutsDialog } from '../src/components/keyboard-shortcuts-dialog';
import {
	Metric,
	metricAccentClass,
	metricIconClass,
	SessionMetric,
	SmallMetric,
} from '../src/components/metrics';
import { Notification } from '../src/components/notification';
import { ResistanceControl } from '../src/components/resistance-control';
import { SessionChart } from '../src/components/session-chart';
import {
	DeleteSessionDialog,
	SessionDetail,
	SessionHistory,
} from '../src/components/session-history';
import { SessionSaveDialog } from '../src/components/session-save-dialog';
import { WelcomeDialog } from '../src/components/welcome-dialog';
import { CHROME_BLUETOOTH_PERMISSION_MESSAGE, emptyMetrics, emptySession } from '../src/constants';
import { historyKeyboardShortcuts } from '../src/lib/keyboard';

const render = (element: React.ReactNode) => renderToStaticMarkup(element);
const enabledEndSessionButton = /<button(?![^>]*disabled)[^>]*>End session<\/button>/;
const solidChartBoundaries =
	/d="M0 14H100 M0 90H100"[^>]*stroke="#3a4654"(?![^>]*stroke-dasharray)/;
const dashedChartGuides =
	/d="M0 52H100 M25 14V90 M50 14V90 M75 14V90"[^>]*stroke-dasharray="2.5 2.5"/;

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
		expect(metricAccentClass('rose')).toBe('bg-rose-400');
		expect(metricAccentClass('other')).toBe('bg-mint');
		expect(metricIconClass('violet')).toBe('text-violet-400');
		expect(metricIconClass('other')).toBe('text-sky-400');
	});

	test('renders a compact session metric', () => {
		expect(render(<SmallMetric label="TIME" value="01:02:03" />)).toContain('01:02:03');
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
				max={100}
				min={0}
				onChange={() => undefined}
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
				step={1}
				value={20}
			/>
		);
		expect(enabled).toContain('aria-label="Resistance"');
		expect(enabled).toContain('value="20"');
		expect(disabled).toContain('disabled');
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
		expect(html).toContain('Connect trainer');
		expect(html).toContain('History');
		expect(html).toContain('Show keyboard controls');
		expect(html).toContain('Ride Control');
		expect(html).toContain('href="https://github.com/lookfirst"');
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
		expect(html).not.toContain('absolute top-[11%] bottom-[8%] left-1');
	});

	test('renders the session save workflow', () => {
		expect(
			render(
				<SessionSaveDialog
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
				continuing
				onClose={() => undefined}
				onSave={async () => undefined}
				onStartWithoutSaving={() => undefined}
				open
				saving={false}
				session={{
					aggregates: emptySession.aggregates,
					calories: 100,
					distance: 10,
					elapsedSeconds: 3600,
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
		expect(html).toContain('No saved sessions yet');
		expect(html).toContain('ml-auto');
		expect(html).toContain('translate-x-0');
		expect(html).toContain('Show history keyboard controls');
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
					distance: 0,
					elapsedSeconds: 0,
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
});
