import { createStore } from '@tanstack/react-store';
import {
	SESSION_WORKFLOW_INTENT,
	SESSION_WORKFLOW_PHASE,
	type SessionWorkflowIntent,
	type SessionWorkflowState,
} from '../lib/session-workflow';

export function initialSessionWorkflowState(open: boolean): SessionWorkflowState {
	return open
		? {
				intent: { kind: SESSION_WORKFLOW_INTENT.END },
				phase: SESSION_WORKFLOW_PHASE.PROMPT,
			}
		: { phase: SESSION_WORKFLOW_PHASE.CLOSED };
}

export function createSessionWorkflowStore(open: boolean) {
	return createStore(initialSessionWorkflowState(open), ({ setState }) => ({
		close: () => {
			setState(() => ({ phase: SESSION_WORKFLOW_PHASE.CLOSED }));
		},
		open: (intent: SessionWorkflowIntent) => {
			setState(() => ({ intent, phase: SESSION_WORKFLOW_PHASE.PROMPT }));
		},
		saveFailed: () => {
			setState((current) =>
				current.phase === SESSION_WORKFLOW_PHASE.SAVING
					? { ...current, phase: SESSION_WORKFLOW_PHASE.PROMPT }
					: current
			);
		},
		startSaving: () => {
			setState((current) =>
				current.phase === SESSION_WORKFLOW_PHASE.PROMPT
					? { ...current, phase: SESSION_WORKFLOW_PHASE.SAVING }
					: current
			);
		},
	}));
}

export type SessionWorkflowStore = ReturnType<typeof createSessionWorkflowStore>;
