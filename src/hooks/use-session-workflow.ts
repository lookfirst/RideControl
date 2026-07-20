import { useSelector } from '@tanstack/react-store';
import { useCallback, useRef } from 'react';
import { errorMessage, unreachable } from '../lib/errors';
import {
	createSavedSession,
	requestPersistentSessionStorage,
	saveSession,
} from '../lib/saved-sessions';
import {
	finishRideSession,
	SESSION_WORKFLOW_INTENT,
	SESSION_WORKFLOW_PHASE,
	type SessionWorkflowController,
	type SessionWorkflowIntent,
} from '../lib/session-workflow';
import { createSessionWorkflowStore } from '../stores/session-workflow-store';
import type { SavedSession, SessionMetadata } from '../types';

export function useSessionWorkflow(
	session: SessionWorkflowController,
	setNotice: (notice: string) => void,
	settleTrainerResistance: () => void
) {
	const sessionIsResolved = Boolean(session.savedSessionId) || session.discarded;
	const storeRef = useRef<ReturnType<typeof createSessionWorkflowStore> | undefined>(undefined);
	storeRef.current ??= createSessionWorkflowStore(session.ended && !sessionIsResolved);
	const store = storeRef.current;
	const state = useSelector(store);
	const finishSession = useCallback(
		() => finishRideSession(session.endSession, settleTrainerResistance),
		[session.endSession, settleTrainerResistance]
	);

	const startNewSession = useCallback(() => {
		session.startNew();
		store.actions.close();
		setNotice('New session ready.');
	}, [session.startNew, setNotice, store]);

	const continueSession = useCallback(
		(savedSession: SavedSession) => {
			session.continueFrom(savedSession);
			store.actions.close();
			setNotice('Session continued.');
		},
		[session.continueFrom, setNotice, store]
	);

	const completeIntent = useCallback(
		(intent: SessionWorkflowIntent, saved: boolean) => {
			switch (intent.kind) {
				case SESSION_WORKFLOW_INTENT.CONTINUE:
					session.continueFrom(intent.session);
					setNotice(
						saved ? 'Session saved. Selected session continued.' : 'Session continued.'
					);
					break;
				case SESSION_WORKFLOW_INTENT.NEW:
					session.startNew();
					setNotice(saved ? 'Session saved. New session ready.' : 'New session ready.');
					break;
				case SESSION_WORKFLOW_INTENT.END:
					if (saved) {
						setNotice('Session saved.');
					} else {
						session.markDiscarded();
						setNotice('Session ended without saving.');
					}
					break;
				default:
					unreachable(intent);
			}
			store.actions.close();
		},
		[session.continueFrom, session.markDiscarded, session.startNew, setNotice, store]
	);

	const endSession = useCallback(() => {
		finishSession();
		store.actions.open({ kind: SESSION_WORKFLOW_INTENT.END });
	}, [finishSession, store]);

	const requestNewSession = useCallback(() => {
		if (session.ended) {
			if (sessionIsResolved) {
				startNewSession();
			} else {
				store.actions.open({ kind: SESSION_WORKFLOW_INTENT.NEW });
			}
			return;
		}
		if (session.elapsedSeconds > 0) {
			finishSession();
			store.actions.open({ kind: SESSION_WORKFLOW_INTENT.NEW });
			return;
		}
		startNewSession();
	}, [
		session.elapsedSeconds,
		session.ended,
		sessionIsResolved,
		finishSession,
		startNewSession,
		store,
	]);

	const requestContinuation = useCallback(
		(savedSession: SavedSession) => {
			const currentNeedsSave =
				(session.ended && !sessionIsResolved) ||
				(!session.ended && session.elapsedSeconds > 0);
			if (!currentNeedsSave) {
				continueSession(savedSession);
				return;
			}
			if (!session.ended) {
				finishSession();
			}
			store.actions.open({ kind: SESSION_WORKFLOW_INTENT.CONTINUE, session: savedSession });
		},
		[
			continueSession,
			session.elapsedSeconds,
			session.ended,
			sessionIsResolved,
			finishSession,
			store,
		]
	);

	const saveCurrentSession = useCallback(
		async (metadata: SessionMetadata) => {
			if (state.phase === SESSION_WORKFLOW_PHASE.CLOSED) {
				return;
			}
			const { intent } = state;
			store.actions.startSaving();
			try {
				const savedSession = createSavedSession(session.snapshot, metadata);
				await saveSession(savedSession);
				session.markSaved(savedSession.id);
				completeIntent(intent, true);
			} catch (error) {
				store.actions.saveFailed();
				setNotice(`Session could not be saved: ${errorMessage(error)}`);
			}
		},
		[completeIntent, session.markSaved, session.snapshot, setNotice, state, store]
	);

	const proceedWithoutSaving = useCallback(() => {
		if (state.phase !== SESSION_WORKFLOW_PHASE.CLOSED) {
			completeIntent(state.intent, false);
		}
	}, [completeIntent, state]);
	const closeSaveDialog = useCallback(() => store.actions.close(), [store]);
	const openSaveDialog = useCallback(
		() => store.actions.open({ kind: SESSION_WORKFLOW_INTENT.END }),
		[store]
	);
	const requestPersistentStorage = useCallback(
		() => requestPersistentSessionStorage().catch(() => false),
		[]
	);

	return {
		closeSaveDialog,
		endSession,
		openSaveDialog,
		proceedWithoutSaving,
		requestContinuation,
		requestNewSession,
		requestPersistentStorage,
		saveCurrentSession,
		saveDialogIntent:
			state.phase === SESSION_WORKFLOW_PHASE.CLOSED
				? SESSION_WORKFLOW_INTENT.END
				: state.intent.kind,
		saveDialogOpen: state.phase !== SESSION_WORKFLOW_PHASE.CLOSED,
		saving: state.phase === SESSION_WORKFLOW_PHASE.SAVING,
		sessionIsResolved,
	};
}
