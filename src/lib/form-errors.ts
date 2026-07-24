import { isRecord, isString } from './type-guards';

export function formErrorMessage(error: unknown): string {
	if (isString(error)) {
		return error;
	}
	if (isRecord(error) && isString(error.message)) {
		return error.message;
	}
	return 'Enter a valid value.';
}
