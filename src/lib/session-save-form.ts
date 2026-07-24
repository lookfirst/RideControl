import { z } from 'zod';
import type { SessionFeeling, SessionMetadata } from '../types';
import { SESSION_FEELING_OPTIONS } from './saved-sessions';

export const MAXIMUM_SESSION_COMMENTS_LENGTH = 2000;

const sessionFeelingSchema = z
	.custom<SessionFeeling>(
		(value) => SESSION_FEELING_OPTIONS.some((option) => option.value === value),
		'Choose a valid session feeling.'
	)
	.optional();

export const sessionSaveFormSchema = z.object({
	comments: z
		.string()
		.max(
			MAXIMUM_SESSION_COMMENTS_LENGTH,
			`Comments must be at most ${MAXIMUM_SESSION_COMMENTS_LENGTH} characters.`
		),
	feeling: sessionFeelingSchema,
});

export type SessionSaveFormValues = z.input<typeof sessionSaveFormSchema>;

export function emptySessionSaveFormValues(): SessionSaveFormValues {
	return { comments: '', feeling: undefined };
}

export function sessionMetadataFromFormValues(values: SessionSaveFormValues): SessionMetadata {
	const validated = sessionSaveFormSchema.parse(values);
	return {
		comments: validated.comments.trim(),
		feeling: validated.feeling,
	};
}
