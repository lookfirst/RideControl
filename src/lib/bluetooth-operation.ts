import { BLUETOOTH_OPERATION_TIMEOUT_MS } from '../constants';
import { withPromiseTimeout } from './promise-timeout';

export function withBluetoothOperationTimeout<T>(
	operation: Promise<T>,
	description: string,
	timeoutMs = BLUETOOTH_OPERATION_TIMEOUT_MS
): Promise<T> {
	return withPromiseTimeout(operation, timeoutMs, () => new Error(`${description} timed out.`));
}
