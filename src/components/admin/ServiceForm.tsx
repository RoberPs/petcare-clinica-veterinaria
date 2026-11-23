'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ADMIN_IDLE, type AdminFormState } from '@/lib/admin/form-state';
import { describedBy, ErrorSummary, FieldError, formMessage, TextField } from '../FormParts';
import { useFormFocus } from '../useFormFocus';

interface Props {
  action: (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
  submissionToken: string;
  staff: { id: string; name: string; bookable: boolean }[];
  initial?: { id: string; name: string; durationMinutes: number; published: boolean; position: number; staffIds: string[] };
  /** Citas confirmadas y futuras del servicio (FR-014). */
  futureCount?: number;
}

const LABELS = { name: 'Nombre', duration_minutes: 'Duración', position: 'Orden', staff_ids: 'Veterinarios' };

const asList = (v: string | string[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

// Formulario de un servicio reservable (US3, FR-012 a FR-014). Funciona sin JavaScript.
export function ServiceForm({ action, submissionToken, staff, initial, futureCount = 0 }: Props) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, ADMIN_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : {};
  const str = (k: string) => (typeof values[k] === 'string' ? (values[k] as string) : undefined);
  const checkedStaff = new Set(asList(values.staff_ids) ?? initial?.staffIds ?? []);
  const active = state.status === 'invalid' ? values.active !== undefined : (initial?.published ?? true);

  return (
    <form className="panel form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={formMessage(state, initial ? `/admin/servicios/${initial.id}` : '/admin/servicios/nuevo')} />
      <input type="hidden" name="submission" value={submissionToken} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <TextField name="name" label="Nombre" required maxLength={60} defaultValue={str('name') ?? initial?.name} errors={errors} />
      <TextField
        name="duration_minutes"
        label="Duración en minutos"
        type="number"
        inputMode="numeric"
        required
        min="5"
        max="480"
        defaultValue={str('duration_minutes') ?? (initial ? String(initial.durationMinutes) : '30')}
        hint="Múltiplo de 5, de 5 a 480 minutos."
        errors={errors}
      />
      <TextField
        name="position"
        label="Orden en el selector"
        type="number"
        inputMode="numeric"
        required
        min="0"
        max="999"
        defaultValue={str('position') ?? String(initial?.position ?? 0)}
        errors={errors}
      />
      <label className="check">
        <input type="checkbox" name="active" defaultChecked={active} />
        <span>Activo (se ofrece en la reserva online)</span>
      </label>
      <fieldset className="choice-list" aria-describedby={describedBy('staff_ids', errors)}>
        <legend>Veterinarios que lo atienden</legend>
        {staff.length === 0 ? <p>Aún no hay veterinarios.</p> : null}
        {staff.map((m) => (
          <label key={m.id}>
            <input type="checkbox" name="staff_ids" value={m.id} defaultChecked={checkedStaff.has(m.id)} />
            <span>
              {m.name}
              {m.bookable ? null : ' (no reservable)'}
            </span>
          </label>
        ))}
        <FieldError name="staff_ids" errors={errors} />
      </fieldset>
      {initial && futureCount > 0 ? (
        <p className="notice">
          Este servicio tiene {futureCount} {futureCount === 1 ? 'cita futura' : 'citas futuras'}. Si lo desactivas o cambias su
          duración, se mantienen tal como están (con su hora de fin).
        </p>
      ) : null}
      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar servicio'}
        </button>
        <Link prefetch={false} className="btn btn--ghost" href="/admin/servicios">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
