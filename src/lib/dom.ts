const EDITABLE_TARGET_SELECTOR = "input, textarea, select, [contenteditable='true']";
const INTERACTIVE_TARGET_SELECTOR = `button, a, ${EDITABLE_TARGET_SELECTOR}`;

function eventTarget(event: Event): HTMLElement | null {
	return event.target instanceof HTMLElement ? event.target : null;
}

export function eventTargetsEditableControl(event: Event): boolean {
	return eventTarget(event)?.matches(EDITABLE_TARGET_SELECTOR) ?? false;
}

export function eventTargetsInteractiveControl(event: Event): boolean {
	return eventTarget(event)?.matches(INTERACTIVE_TARGET_SELECTOR) ?? false;
}

export function keyboardEventHasModifiers(event: KeyboardEvent): boolean {
	return event.altKey || event.ctrlKey || event.metaKey;
}
