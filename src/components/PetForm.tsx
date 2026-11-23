'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ACCOUNT_LIMITS } from '@/domain/account-fields';
import type { PetFormState } from '@/lib/account/form-state';
import { describedBy, ErrorSummary, FieldError, fieldId, formMessage, TextField } from './FormParts';
import { useFormFocus } from './useFormFocus';

interface Props {
  action: (prev: PetFormState, form: FormData) => Promise<PetFormState>;
  species: { key: string; label: string }[];
  /** Fecha de hoy en Europe/Madrid (AAAA-MM-DD): el máximo del selector de fecha. */
  today: string;
  /** Solo en el alta: idempotencia del envío (A5). */
  submissionToken?: string;
  initial?: { name: string; species: string; birthDate: string };
  submitLabel: string;
}

const LABELS = { name: 'Nombre', species: 'Especie', birth_date: 'Fecha de nacimiento' };
const IDLE: PetFormState = { status: 'idle' };
/** Valor de la opción "Otra" (se guarda como especie vacía). */
const OTHER = 'other';

// Alta y edición de una mascota (US3).
export function PetForm({ action, species, today, submissionToken, initial, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<PetFormState, FormData>(action, IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : {};
  const speciesValue = values.species ?? initial?.species ?? '';

  const message =
    state.status === 'limit_reached'
      ? 'Ya tienes 30 mascotas, el máximo por cuenta. Elimina alguna para añadir otra.'
      : formMessage(state, '/mi-cuenta/mascotas/nueva');

  return (
    <form className="panel form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={message} />
      {submissionToken ? <input type="hidden" name="submission_token" value={submissionToken} /> : null}

      <TextField
        name="name"
        label="Nombre"
        required
        maxLength={ACCOUNT_LIMITS.petName}
        defaultValue={values.name ?? initial?.name}
        errors={errors}
      />

      <div className={errors.species ? 'field field--invalid' : 'field'}>
        <label htmlFor={fieldId('species')}>Especie</label>
        {/* key: React restablece el formulario tras la acción y un <select> volvería a su valor inicial. */}
        <select
          key={speciesValue}
          id={fieldId('species')}
          name="species"
          required
          defaultValue={speciesValue}
          aria-invalid={errors.species ? true : undefined}
          aria-describedby={describedBy('species', errors)}
        >
          <option value="" disabled>
            Elige una especie
          </option>
          {species.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
          <option value={OTHER}>Otra</option>
        </select>
        <FieldError name="species" errors={errors} />
      </div>

      <TextField
        name="birth_date"
        label="Fecha de nacimiento"
        type="date"
        required
        max={today}
        defaultValue={values.birth_date ?? initial?.birthDate}
        hint="Si no la sabes con exactitud, pon una aproximada."
        errors={errors}
      />

      <div className="band__actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </button>
        <Link prefetch={false} className="btn btn--ghost" href="/mi-cuenta/mascotas">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
