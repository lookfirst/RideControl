import { isFunction } from './type-guards';

interface BrowserBrand {
	brand: string;
}

interface BrowserNavigator {
	brave?: unknown;
	userAgent: string;
	userAgentData?: {
		brands: readonly BrowserBrand[];
	};
}

interface BluetoothReconnectCapability {
	getDevices?: unknown;
}

const CHROME_USER_AGENT = /\bChrome\//;
const CHROMIUM_DERIVATIVE_USER_AGENT = /(?:Brave|Edg|OPR|Vivaldi|YaBrowser)\//;

function browserBrands(browser: BrowserNavigator) {
	return browser.userAgentData?.brands.map(({ brand }) => brand.toLowerCase()) ?? [];
}

export function isTestedChromeBrowser(browser: BrowserNavigator | undefined): boolean {
	if (!browser || browser.brave) {
		return false;
	}
	const brands = browserBrands(browser);
	if (brands.length) {
		return (
			brands.includes('google chrome') &&
			!brands.some((brand) => ['brave', 'microsoft edge', 'opera', 'vivaldi'].includes(brand))
		);
	}
	return (
		CHROME_USER_AGENT.test(browser.userAgent) &&
		!CHROMIUM_DERIVATIVE_USER_AGENT.test(browser.userAgent)
	);
}

export function bluetoothBrowserNotice(
	browser = globalThis.navigator as BrowserNavigator | undefined
): string | undefined {
	if (!browser || isTestedChromeBrowser(browser)) {
		return;
	}
	if (browser.brave || browserBrands(browser).includes('brave')) {
		return 'Bluetooth does not work in Brave. Chrome is currently the only browser tested with Ride Control.';
	}
	return 'Bluetooth is unavailable in this browser. Chrome is currently the only browser tested with Ride Control.';
}

export function automaticBluetoothReconnectConfigured(
	bluetooth: BluetoothReconnectCapability | undefined = globalThis.navigator?.bluetooth
): boolean {
	return isFunction(bluetooth?.getDevices);
}
