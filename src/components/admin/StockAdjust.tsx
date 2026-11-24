'use client';

import { useActionState } from 'react';
import { MAX_STOCK_DELTA, STOCK_ADJUST_REASONS, STOCK_REASON_LABELS } from '@/domain/stock';
import { ADMIN_IDLE, type AdminFormState } from '@/lib/admin/form-state';
import { describedBy, ErrorSummary, FieldError, fieldId, formMessage, TextField } from '../FormParts';
import { useFormFocus } from '../useFormFocus';

interface Props {
  action: (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
  submissionToken: string;
  productId: string;
}

const LABELS = { delta: 'Cantidad', reason: 'Motivo', note: 'Nota' };

// Ajuste manual del stock (US4, FR-010 y FR-011): suma o resta unidades con un motivo. Funciona sin
// JavaScript; si no hay unidades suficientes, la página avisa del máximo que se puede restar.
export function StockAdjust({ action, submissionToken, productId }: Props) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, ADMIN_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const invalid = state.status === 'invalid';
  const errors = invalid ? state.fieldErrors : {};
  const values = invalid ? state.values : {};
  const str = (k: string) => (typeof values[k] === 'string' ? (values[k] as string) : undefined);
  return (
    <form key={invalid ? JSON.stringify(values) : state.status} className="panel form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={formMessage(state, `/admin/productos/${productId}/stock`)} />
      <input type="hidden" name="submission" value={submissionToken} />
      <input type="hidden" name="id" value={productId} />
      <TextField
        name="delta"
        label="Cantidad"
        type="number"
        inputMode="numeric"
        required
        min={String(-MAX_STOCK_DELTA)}
        max={String(MAX_STOCK_DELTA)}
        defaultValue={str('delta')}
        hint="Positiva para sumar (por ejemplo, 10) y negativa para restar (por ejemplo, -2)."
        errors={errors}
      />
      <div className={errors.reason ? 'field field--invalid' : 'field'}>
        <label htmlFor={fieldId('reason')}>Motivo</label>
        <select
          id={fieldId('reason')}
          name="reason"
          required
          defaultValue={str('reason') ?? 'restock'}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={describedBy('reason', errors)}
        >
          {STOCK_ADJUST_REASONS.map((r) => (
            <option key={r} value={r}>
              {STOCK_REASON_LABELS[r]}
            </option>
          ))}
        </select>
        <FieldError name="reason" errors={errors} />
      </div>
      <TextField name="note" label="Nota" optional maxLength={200} defaultValue={str('note')} hint="Obligatoria con el motivo «Otro». Hasta 200 caracteres." errors={errors} />
      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Guardando…' : 'Ajustar el stock'}
        </button>
      </div>
    </form>
  );
}
