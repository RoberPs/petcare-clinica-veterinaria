'use client';

import { useActionState } from 'react';
import { changePassword, updateMarketing, updateProfile } from '@/app/mi-cuenta/datos/actions';
import { ACCOUNT_LIMITS } from '@/domain/account-fields';
import { IDLE, type FormState } from '@/lib/account/form-state';
import { ErrorSummary, formMessage, TextField } from './FormParts';
import { PasswordFields } from './PasswordFields';
import { useFormFocus } from './useFormFocus';

export interface ProfileValues {
  firstName: string;
  lastName: string;
  phone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
}

const PROFILE_LABELS = {
  first_name: 'Nombre',
  last_name: 'Apellidos',
  phone: 'Teléfono',
  address_line: 'Dirección',
  postal_code: 'Código postal',
  city: 'Localidad',
  province: 'Provincia',
};

// Datos personales (US6). El correo no está aquí: se muestra en solo lectura en la página.
export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateProfile, IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : {};
  const v = (name: keyof typeof PROFILE_LABELS, fallback: string | null) => values[name] ?? fallback ?? '';

  return (
    <form className="panel form" action={formAction} noValidate={hydrated} aria-labelledby="titulo-datos">
      <h2 id="titulo-datos">Tus datos</h2>
      <ErrorSummary errors={errors} labels={PROFILE_LABELS} summaryRef={summaryRef} message={formMessage(state, '/mi-cuenta/datos')} />
      <div className="field-row">
        <TextField name="first_name" label="Nombre" autoComplete="given-name" required maxLength={ACCOUNT_LIMITS.firstName} defaultValue={v('first_name', initial.firstName)} errors={errors} />
        <TextField name="last_name" label="Apellidos" autoComplete="family-name" required maxLength={ACCOUNT_LIMITS.lastName} defaultValue={v('last_name', initial.lastName)} errors={errors} />
      </div>
      <TextField name="phone" label="Teléfono" type="tel" inputMode="tel" autoComplete="tel" optional maxLength={ACCOUNT_LIMITS.phone} defaultValue={v('phone', initial.phone)} errors={errors} />
      <TextField
        name="address_line"
        label="Dirección"
        autoComplete="street-address"
        optional
        maxLength={ACCOUNT_LIMITS.addressLine}
        defaultValue={v('address_line', initial.addressLine)}
        hint="Calle, número, piso y puerta. Solo para los envíos de la tienda."
        errors={errors}
      />
      <div className="field-row">
        <TextField name="postal_code" label="Código postal" autoComplete="postal-code" inputMode="numeric" optional maxLength={5} defaultValue={v('postal_code', initial.postalCode)} errors={errors} />
        <TextField name="city" label="Localidad" autoComplete="address-level2" optional maxLength={ACCOUNT_LIMITS.city} defaultValue={v('city', initial.city)} errors={errors} />
      </div>
      <TextField name="province" label="Provincia" autoComplete="address-level1" optional maxLength={ACCOUNT_LIMITS.province} defaultValue={v('province', initial.province)} errors={errors} />
      <button className="btn form__submit" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar mis datos'}
      </button>
    </form>
  );
}

const PASSWORD_LABELS = { current_password: 'Contraseña actual', password: 'Nueva contraseña', password_confirm: 'Repetir contraseña' };

// Cambio de contraseña (US6): un formulario aparte, con la contraseña actual.
export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(changePassword, IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};

  return (
    <form className="panel form" action={formAction} noValidate={hydrated} aria-labelledby="titulo-contrasena">
      <h2 id="titulo-contrasena">Cambiar la contraseña</h2>
      <ErrorSummary errors={errors} labels={PASSWORD_LABELS} summaryRef={summaryRef} message={formMessage(state, '/mi-cuenta/datos')} />
      <TextField name="current_password" label="Contraseña actual" type="password" autoComplete="current-password" required errors={errors} />
      <PasswordFields errors={errors} label="Nueva contraseña" />
      <p className="field__hint">Al cambiarla se cerrará la sesión en tus otros dispositivos.</p>
      <button className="btn form__submit" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? 'Guardando…' : 'Cambiar la contraseña'}
      </button>
    </form>
  );
}

// Preferencia de consejos y novedades (US8). Separada de los datos: es un consentimiento que se
// puede retirar en cualquier momento.
export function MarketingForm({ optIn }: { optIn: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateMarketing, IDLE);
  const { summaryRef } = useFormFocus(state);

  return (
    <form className="panel form" action={formAction} aria-labelledby="titulo-comunicaciones">
      <h2 id="titulo-comunicaciones">Comunicaciones</h2>
      <ErrorSummary errors={{}} labels={{}} summaryRef={summaryRef} message={formMessage(state, '/mi-cuenta/datos')} />
      <label className="check">
        {/* key: tras guardar, la casilla refleja el valor nuevo aunque React restablezca el formulario. */}
        <input key={String(optIn)} type="checkbox" name="marketing_opt_in" defaultChecked={optIn} />
        <span>Quiero recibir por correo consejos de salud para mis mascotas y novedades de la clínica.</span>
      </label>
      <p className="field__hint">Puedes cambiarlo cuando quieras. Nunca compartimos tu correo.</p>
      <button className="btn form__submit" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar la preferencia'}
      </button>
    </form>
  );
}

