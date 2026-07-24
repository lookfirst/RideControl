import type { AnyFieldApi } from '@tanstack/react-form';
import { formErrorMessage } from '../lib/form-errors';

export function FormFieldError({
	className = 'mt-1.5 text-rose-300 text-xs leading-5',
	field,
}: {
	className?: string;
	field: AnyFieldApi;
}) {
	if (field.state.meta.errors.length === 0) {
		return null;
	}
	return (
		<p className={className} role="alert">
			{field.state.meta.errors.map(formErrorMessage).join(' ')}
		</p>
	);
}
