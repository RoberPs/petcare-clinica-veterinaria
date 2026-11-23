'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { weekFieldName } from '@/domain/admin-schemas';
import { ADMIN_IDLE, type AdminFormState } from '@/lib/admin/form-state';
import { describedBy, ErrorSummary, FieldError, fieldId, formMessage } from '../FormParts';
import { useFormFocus } from '../useFormFocus';

interface Props {
  action: (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
  submissionToken: string;
  staffId: string;
  /** Tramos actuales: [día 1..7] → hasta 3 tramos "HH:MM". */
  initial: { weekday: number; opensAt: string; closesAt: string }[];
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const RANGES = [0, 1, 2];

const LABELS: Record<string, string> = Object.fromEntries(
  DAYS.flatMap((day, d) =>
    RANGES.flatMap((i) => [
      [weekFieldName(d + 1, i, 'opens'), `${day}, tramo ${i + 1}: inicio`],
      [weekFieldName(d + 1, i, 'closes'), `${day}, tramo ${i + 1}: fin`],
    ]),
  ),
);

// Horario semanal de un veterinario (FR-016): 7 días × 3 tramos fijos, sin JavaScript obligatorio.
export function ScheduleGrid({ action, submissionToken, staffId, initial }: Props) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, ADMIN_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : null;
  const value = (weekday: number, i: number, field: 'opens' | 'closes') => {
    if (values) {
      const v = values[weekFieldName(weekday, i, field)];
      return typeof v === 'string' ? v : '';
    }
    const slot = initial.filter((s) => s.weekday === weekday)[i];
    return slot ? (field === 'opens' ? slot.opensAt : slot.closesAt).slice(0, 5) : '';
  };

  return (
    <form className="panel form" action={formAction} noValidate={hydrated}>
      <ErrorSummary
        errors={errors}
        labels={{ _form: 'Formulario', ...LABELS }}
        summaryRef={summaryRef}
        message={formMessage(state, `/admin/veterinarios/${staffId}/horario`)}
      />
      <input type="hidden" name="submission" value={submissionToken} />
      <input type="hidden" name="staff_id" value={staffId} />
      <div className="schedule-grid">
        {DAYS.map((day, d) => (
          <fieldset key={day}>
            <legend>{day}</legend>
            <div className="schedule-grid__ranges">
              {RANGES.map((i) => (
                <div key={i} className="schedule-grid__range">
                  {(['opens', 'closes'] as const).map((field) => {
                    const name = weekFieldName(d + 1, i, field);
                    return (
                      <div key={field} className={errors[name] ? 'field field--invalid' : 'field'}>
                        <label htmlFor={fieldId(name)}>
                          {field === 'opens' ? `Tramo ${i + 1}: inicio` : `Tramo ${i + 1}: fin`}
                        </label>
                        <input
                          id={fieldId(name)}
                          name={name}
                          type="time"
                          step={300}
                          defaultValue={value(d + 1, i, field)}
                          aria-invalid={errors[name] ? true : undefined}
                          aria-describedby={describedBy(name, errors)}
                        />
                        <FieldError name={name} errors={errors} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <p className="agenda-col__hours">Deja un tramo vacío si no se usa. Sin ningún tramo, el veterinario no recibe reservas.</p>
      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar horario'}
        </button>
        <Link prefetch={false} className="btn btn--ghost" href={`/admin/veterinarios/${staffId}`}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
