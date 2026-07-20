const ELEMENT_NODE = 1;

export function elementName(element: Element): string {
	return element.localName || element.nodeName.split(':').at(-1) || element.nodeName;
}

export function childElements(element: Element): Element[] {
	return Array.from(element.childNodes).filter(
		(node): node is Element => node.nodeType === ELEMENT_NODE
	);
}

export function xmlChild(element: Element, name: string): Element | undefined {
	return childElements(element).find((candidate) => elementName(candidate) === name);
}

export function xmlDescendants(element: Element, name: string): Element[] {
	return Array.from(element.getElementsByTagName('*')).filter(
		(candidate) => elementName(candidate) === name
	);
}

export function xmlDescendant(element: Element, name: string): Element | undefined {
	return xmlDescendants(element, name)[0];
}

export function xmlText(element: Element | undefined): string {
	return element?.textContent?.trim() ?? '';
}

export function xmlNumber(element: Element | undefined): number | undefined {
	const source = xmlText(element);
	if (!source) {
		return;
	}
	const value = Number(source);
	return Number.isFinite(value) ? value : undefined;
}

export function xmlEscape(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
