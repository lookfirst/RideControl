export function requestUnloadConfirmation(
	event: Pick<BeforeUnloadEvent, 'preventDefault' | 'returnValue'>
): void {
	event.preventDefault();
	event.returnValue = true;
}
