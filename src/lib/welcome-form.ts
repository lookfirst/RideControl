import { z } from 'zod';

export const welcomeFormSchema = z.object({
	dontShowAgain: z.boolean(),
});

export type WelcomeFormValues = z.infer<typeof welcomeFormSchema>;

export function emptyWelcomeFormValues(): WelcomeFormValues {
	return { dontShowAgain: false };
}
