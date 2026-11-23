'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ADMIN_IDLE, type AdminFormState } from '@/lib/admin/form-state';
import { describedBy, ErrorSummary, FieldError, formMessage, TextField } from '../FormParts';
import { useFormFocus } from '../useFormFocus';

interface Props {
  action: (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
  submissionToken: string;
  services: { id: string; name: string; published: boolean }[];
  initial?: { id: string; name: string; bookable: boolean; bookingPosition: number; serviceIds: string[] };
}

const LABELS = { name: 'Nombre', booking_position: 'Orden', service_ids: 'Servicios' };

const asList = (v: string | string[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

// Datos de agenda de un veterinario (US3, FR-015). La ficha pública del equipo no se edita aquí.
export function StaffForm({ action, submissionToken, services, initial }: Props) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, ADMIN_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : {};
  const str = (k: string) => (typeof values[k] === 'string' ? (values[k] as string) : undefined);
  const checked = new Set(asList(values.service_ids) ?? initial?.serviceIds ?? []);
  const bookable = state.status === 'invalid' ? values.bookable !== undefined : (initial?.bookable ?? true);

  return (
    <form className="panel form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={formMessage(state, initial ? `/admin/veterinarios/${initial.id}` : '/admin/veterinarios/nuevo')} />
      <input type="hidden" name="submission" value={submissionToken} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <TextField name="name" label="Nombre visible" required maxLength={80} defaultValue={str('name') ?? initial?.name} errors={errors} />
      <TextField
        name="booking_position"
        label="Orden en el selector"
        type="number"
        inputMode="numeric"
        required
        min="0"
        max="999"
        defaultValue={str('booking_position') ?? String(initial?.bookingPosition ?? 0)}
        errors={errors}
      />
      <label className="check">
        <input type="checkbox" name="bookable" defaultChecked={bookable} />
        <span>Reservable (recibe reservas online si tiene horario)</span>
      </label>
      <fieldset className="choice-list" aria-describedby={describedBy('service_ids', errors)}>
        <legend>Servicios que atiende</legend>
        {services.map((s) => (
          <label key={s.id}>
            <input type="checkbox" name="service_ids" value={s.id} defaultChecked={checked.has(s.id)} />
            <span>
              {s.name}
              {s.published ? null : ' (inactivo)'}
            </span>
          </label>
        ))}
        <FieldError name="service_ids" errors={errors} />
      </fieldset>
      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar veterinario'}
        </button>
        <Link prefetch={false} className="btn btn--ghost" href="/admin/veterinarios">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
