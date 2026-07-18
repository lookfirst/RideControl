import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/app';
import { ConnectionControl } from '../src/components/connection-control';
import { Icon } from '../src/components/icon';
import { Metric, metricAccentClass, metricIconClass, SmallMetric } from '../src/components/metrics';
import { Notification } from '../src/components/notification';
import { ResistanceControl } from '../src/components/resistance-control';
import { CHROME_BLUETOOTH_PERMISSION_MESSAGE } from '../src/constants';

const render = (element: React.ReactNode) => renderToStaticMarkup(element);

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
		expect(
			render(<ConnectionControl connected={false} onClick={() => undefined} status="Ready" />)
		).toContain('Connect trainer');
		expect(
			render(
				<ConnectionControl
					connected={false}
					onClick={() => undefined}
					status="Connecting…"
				/>
			)
		).toContain('disabled');
		expect(
			render(
				<ConnectionControl
					connected
					deviceName="KICKR"
					onClick={() => undefined}
					status="Connected"
				/>
			)
		).toContain('Disconnect');
	});

	test('hides empty notifications and expands setup guidance', () => {
		expect(
			render(<Notification connected={false} notice="" onDismiss={() => undefined} />)
		).toBe('');
		const html = render(
			<Notification
				connected={false}
				notice={CHROME_BLUETOOTH_PERMISSION_MESSAGE}
				onDismiss={() => undefined}
			/>
		);
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
	});
});
