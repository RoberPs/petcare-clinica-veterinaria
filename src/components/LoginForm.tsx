'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { resendVerificationFromLogin } from '@/app/crear-cuenta/actions';
import { login } from '@/app/iniciar-sesion/actions';
import { ACCOUNT_LIMITS } from '@/domain/account-fields';
import type { LoginState } from '@/lib/account/form-state';
import { ErrorSummary, formMessage, TextField } from './FormParts';
import { useFormFocus } from './useFormFocus';

interface Props {
  /** Correo de la cookie pc_login_hint (tras confirmar el correo). */
  defaultEmail?: string;
  returnTo?: string;
}

const LABELS = { email: 'Correo electrónico', password: 'Contraseña' };
const IDLE: LoginState = { status: 'idle' };

// Formulario de inicio de sesión (US2, design/login.html).
export function LoginForm({ defaultEmail, returnTo }: Props) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const email =
    state.status === 'invalid' || state.status === 'credentials'
      ? state.values.email
      : state.status === 'unverified'
        ? state.email
        : defaultEmail;

  return (
    <>
      {state.status === 'unverified' ? (
        // Fuera del formulario de acceso: los formularios no se pueden anidar.
        <div className="form-summary" role="alert" ref={summaryRef} tabIndex={-1}>
          <p>Antes de entrar tienes que confirmar tu correo. Busca el enlace que te enviamos o pide otro.</p>
          <form action={resendVerificationFromLogin}>
            <input type="hidden" name="email" value={state.email} />
            <button className="btn btn--sm" type="submit">
              Reenviar el enlace
            </button>
          </form>
        </div>
      ) : null}

      <form className="form" action={formAction} noValidate={hydrated}>
        {state.status !== 'unverified' ? (
          <ErrorSummary
            errors={errors}
            labels={LABELS}
            summaryRef={summaryRef}
            message={
              state.status === 'credentials'
                ? 'El correo o la contraseña no son correctos.'
                : formMessage(state, '/iniciar-sesion')
            }
          />
        ) : null}
        {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
        <TextField
          name="email"
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          maxLength={ACCOUNT_LIMITS.email}
          defaultValue={email}
          errors={errors}
        />
        <TextField name="password" label="Contraseña" type="password" autoComplete="current-password" required errors={errors} />
        <div className="auth__options">
          <label className="check">
            <input type="checkbox" name="remember" />
            <span>Recordarme</span>
          </label>
          <Link prefetch={false} href="/recuperar-contrasena">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <button className="btn btn--block" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </>
  );
}
