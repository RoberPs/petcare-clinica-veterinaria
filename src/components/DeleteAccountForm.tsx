'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { deleteAccount } from '@/app/mi-cuenta/eliminar-cuenta/actions';
import { IDLE, type FormState } from '@/lib/account/form-state';
import { ErrorSummary, formMessage, TextField } from './FormParts';
import { useFormFocus } from './useFormFocus';

// Confirmación del borrado de la cuenta con la contraseña (US7). Botón neutro (.btn): no hay color de
// peligro (principio I); lo refuerzan el texto, la página propia y la contraseña.
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(deleteAccount, IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};

  return (
    <form className="form" action={formAction} noValidate={hydrated}>
      <ErrorSummary
        errors={errors}
        labels={{ current_password: 'Contraseña' }}
        summaryRef={summaryRef}
        message={formMessage(state, '/mi-cuenta/eliminar-cuenta')}
      />
      <TextField
        name="current_password"
        label="Escribe tu contraseña para confirmar"
        type="password"
        autoComplete="current-password"
        required
        errors={errors}
      />
      <div className="band__actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Eliminando…' : 'Eliminar mi cuenta'}
        </button>
        <Link prefetch={false} className="btn btn--ghost" href="/mi-cuenta/datos">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
