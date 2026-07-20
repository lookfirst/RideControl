import { describe, expect, test } from 'bun:test';
import {
	finishRideSession,
	SESSION_WORKFLOW_INTENT,
	SESSION_WORKFLOW_PHASE,
} from '../src/lib/session-workflow';
import {
	createSessionWorkflowStore,
	initialSessionWorkflowState,
} from '../src/stores/session-workflow-store';
import type { SavedSession } from '../src/types';

describe('session workflow store', () => {
	test('settles trainer resistance whenever a ride session finishes', () => {
		const actions: string[] = [];
		finishRideSession(
			() => actions.push('end session'),
			() => actions.push('settle resistance')
		);
		expect(actions).toEqual(['end session', 'settle resistance']);
	});

	test('opens with the ended-session intent when an unsaved session is restored', () => {
		expect(initialSessionWorkflowState(true)).toEqual({
			intent: { kind: SESSION_WORKFLOW_INTENT.END },
			phase: SESSION_WORKFLOW_PHASE.PROMPT,
		});
		expect(initialSessionWorkflowState(false)).toEqual({
			phase: SESSION_WORKFLOW_PHASE.CLOSED,
		});
	});

	test('preserves the requested next session while saving', () => {
		const session = { id: 'saved-session' } as SavedSession;
		const store = createSessionWorkflowStore(false);
		store.actions.open({ kind: SESSION_WORKFLOW_INTENT.CONTINUE, session });
		const prompt = store.get();
		expect(prompt).toEqual({
			intent: { kind: SESSION_WORKFLOW_INTENT.CONTINUE, session },
			phase: SESSION_WORKFLOW_PHASE.PROMPT,
		});
		store.actions.startSaving();
		expect(store.get()).toEqual({
			intent: { kind: SESSION_WORKFLOW_INTENT.CONTINUE, session },
			phase: SESSION_WORKFLOW_PHASE.SAVING,
		});
		store.actions.saveFailed();
		expect(store.get()).toEqual(prompt);
	});

	test('ignores invalid transitions and closes atomically', () => {
		const store = createSessionWorkflowStore(false);
		const closed = store.get();
		store.actions.startSaving();
		expect(store.get()).toBe(closed);
		store.actions.saveFailed();
		expect(store.get()).toBe(closed);
		store.actions.open({ kind: SESSION_WORKFLOW_INTENT.NEW });
		store.actions.close();
		expect(store.get()).toEqual({ phase: SESSION_WORKFLOW_PHASE.CLOSED });
	});
});
