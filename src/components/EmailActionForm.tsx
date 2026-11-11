'use client';

import { useActionState } from 'react';
import { ACCOUNT_LIMITS } from '@/domain/account-fields';
import { IDLE, type FormState } from '@/lib/account/form-state';
import { ErrorSummary, formMessage, TextField } from './FormParts';
import { useFormFocus } from './useFormFocus';

interface Props {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  buttonLabel: string;
  buttonClass?: string;
  /** Página que se recarga si el formulario caduca. */
  reloadHref: string;
  email?: string;
}

// Formulario de un solo campo de correo: reenviar la verificación o pedir la recuperación de la
// contraseña. La respuesta del servidor es la misma exista o no la cuenta.
export function EmailActionForm({ action, buttonLabel, buttonClass = 'btn btn--block', reloadHref, email }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : {};

  return (
    <form className="form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={{ email: 'Correo electrónico' }} summaryRef={summaryRef} message={formMessage(state, reloadHref)} />
      <TextField
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        required
        maxLength={ACCOUNT_LIMITS.email}
        defaultValue={values.email ?? email}
        errors={errors}
      />
      <button className={buttonClass} type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? 'Enviando…' : buttonLabel}
      </button>
    </form>
  );
}
