import { describe, expect, test } from 'bun:test';
import {
	automaticBluetoothReconnectConfigured,
	bluetoothBrowserNotice,
	isTestedChromeBrowser,
} from '../src/lib/browser';

function browser(userAgent: string, brands: string[] = [], extra: Record<string, unknown> = {}) {
	return {
		...extra,
		userAgent,
		userAgentData: brands.length
			? { brands: brands.map((brand) => ({ brand, version: '1' })) }
			: undefined,
	};
}

describe('browser compatibility', () => {
	test('recognizes tested Chrome without accepting Chromium derivatives', () => {
		expect(
			isTestedChromeBrowser(browser('Chrome/140', ['Chromium', 'Google Chrome']))
		).toBeTrue();
		expect(
			isTestedChromeBrowser(browser('Chrome/140 Edg/140', ['Chromium', 'Microsoft Edge']))
		).toBeFalse();
		expect(
			isTestedChromeBrowser(
				browser('Chrome/140', ['Chromium'], { brave: { isBrave: () => true } })
			)
		).toBeFalse();
	});

	test('uses a Brave-specific tray notice and stays quiet in Chrome', () => {
		expect(
			bluetoothBrowserNotice(
				browser('Chrome/140', ['Chromium'], { brave: { isBrave: () => true } })
			)
		).toContain('does not work in Brave');
		expect(
			bluetoothBrowserNotice(browser('Chrome/140', ['Chromium', 'Google Chrome']))
		).toBeUndefined();
		expect(bluetoothBrowserNotice(browser('Firefox/142'))).toContain(
			'Chrome is currently the only browser tested'
		);
	});

	test('detects the persistent Bluetooth reconnect capability', () => {
		expect(automaticBluetoothReconnectConfigured({ getDevices: async () => [] })).toBeTrue();
		expect(automaticBluetoothReconnectConfigured({})).toBeFalse();
	});
});
