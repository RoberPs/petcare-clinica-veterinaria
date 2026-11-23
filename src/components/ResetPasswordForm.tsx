'use client';

import { useActionState } from 'react';
import { resetPassword } from '@/app/restablecer-contrasena/actions';
import { IDLE, type FormState } from '@/lib/account/form-state';
import { ErrorSummary, formMessage } from './FormParts';
import { PasswordFields } from './PasswordFields';
import { useFormFocus } from './useFormFocus';

const LABELS = { password: 'Nueva contraseña', password_confirm: 'Repetir contraseña' };

// Nueva contraseña con el enlace del correo (US5). El token va oculto y se gasta al enviar.
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(resetPassword, IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};

  return (
    <form className="form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={formMessage(state, '/recuperar-contrasena')} />
      <input type="hidden" name="token" value={token} />
      <PasswordFields errors={errors} label="Nueva contraseña" />
      <button className="btn btn--block" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar la contraseña'}
      </button>
    </form>
  );
}
