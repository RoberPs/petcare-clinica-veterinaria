'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { register } from '@/app/crear-cuenta/actions';
import { ACCOUNT_LIMITS } from '@/domain/account-fields';
import { IDLE, type FormState } from '@/lib/account/form-state';
import { describedBy, ErrorSummary, FieldError, fieldId, formMessage, TextField } from './FormParts';
import { PasswordFields } from './PasswordFields';
import { useFormFocus } from './useFormFocus';

const LABELS = {
  first_name: 'Nombre',
  last_name: 'Apellidos',
  email: 'Correo electrónico',
  phone: 'Teléfono',
  password: 'Contraseña',
  password_confirm: 'Repetir contraseña',
  accept_terms: 'Privacidad y términos',
};

// Formulario de registro (US1, design/registro.html). Sin JavaScript es un POST normal al Server
// Action; con JavaScript añade "Creando…" y el foco en el resumen de errores.
export function RegisterForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(register, IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : {};

  return (
    <form className="form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={formMessage(state, '/crear-cuenta')} />

      <input type="hidden" name="submission_token" value={token} />
      <div className="honeypot" aria-hidden="true">
        <label>
          No rellenes este campo
          <input type="text" name="web" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="field-row">
        <TextField
          name="first_name"
          label="Nombre"
          autoComplete="given-name"
          required
          maxLength={ACCOUNT_LIMITS.firstName}
          defaultValue={values.first_name}
          errors={errors}
        />
        <TextField
          name="last_name"
          label="Apellidos"
          autoComplete="family-name"
          required
          maxLength={ACCOUNT_LIMITS.lastName}
          defaultValue={values.last_name}
          errors={errors}
        />
      </div>
      <TextField
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        required
        maxLength={ACCOUNT_LIMITS.email}
        defaultValue={values.email}
        errors={errors}
      />
      <TextField
        name="phone"
        label="Teléfono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        optional
        maxLength={ACCOUNT_LIMITS.phone}
        defaultValue={values.phone}
        hint="Para avisarte si hay un cambio en tu cita."
        errors={errors}
      />
      <PasswordFields errors={errors} />

      <div id={fieldId('accept_terms')}>
        <label className={errors.accept_terms ? 'check check--invalid' : 'check'}>
          <input
            type="checkbox"
            name="accept_terms"
            required
            defaultChecked={values.accept_terms === 'on'}
            aria-invalid={errors.accept_terms ? true : undefined}
            aria-describedby={describedBy('accept_terms', errors)}
          />
          <span>
            He leído y acepto la{' '}
            <Link prefetch={false} href="/privacidad">
              política de privacidad
            </Link>{' '}
            y los{' '}
            <Link prefetch={false} href="/terminos">
              términos de uso
            </Link>
            .
          </span>
        </label>
        <FieldError name="accept_terms" errors={errors} />
      </div>

      <fieldset>
        <legend>Comunicaciones (opcional)</legend>
        <label className="check">
          <input type="checkbox" name="marketing_opt_in" defaultChecked={values.marketing_opt_in === 'on'} />
          <span>Quiero recibir por correo consejos de salud para mis mascotas y novedades de la clínica.</span>
        </label>
      </fieldset>

      <button className="btn btn--block" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? 'Creando la cuenta…' : 'Crear cuenta'}
      </button>
    </form>
  );
}
