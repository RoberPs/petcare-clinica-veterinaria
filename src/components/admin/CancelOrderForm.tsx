'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ADMIN_IDLE, type AdminFormState } from '@/lib/admin/form-state';
import { describedBy, ErrorSummary, FieldError, fieldId, formMessage } from '../FormParts';
import { useFormFocus } from '../useFormFocus';

interface Props {
  action: (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
  submissionToken: string;
  orderId: string;
  from: string;
  back: string;
  /** Pagado: aviso de cómo se devuelve el importe. */
  refundNote: string | null;
  noteMax: number;
}

const LABELS = { note: 'Motivo interno' };

// Confirmación de la cancelación de un pedido (US3, escenario 4; G10). El motivo es interno: se
// guarda en el historial y no se envía al comprador. Funciona sin JavaScript.
export function CancelOrderForm({ action, submissionToken, orderId, from, back, refundNote, noteMax }: Props) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, ADMIN_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const note = state.status === 'invalid' && typeof state.values.note === 'string' ? state.values.note : undefined;
  const detail = `/admin/pedidos/${orderId}${back !== '/admin/pedidos' ? `?volver=${encodeURIComponent(back)}` : ''}`;
  return (
    <form className="panel form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={formMessage(state, `/admin/pedidos/${orderId}/cancelar`)} />
      <input type="hidden" name="submission" value={submissionToken} />
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="volver" value={back} />
      <div className={errors.note ? 'field field--invalid' : 'field'}>
        <label htmlFor={fieldId('note')}>Motivo interno</label>
        <textarea
          id={fieldId('note')}
          name="note"
          rows={3}
          required
          minLength={3}
          maxLength={noteMax}
          defaultValue={note}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={describedBy('note', errors, 'note-hint')}
        />
        <span className="field__hint" id="note-hint">
          De 3 a {noteMax} caracteres. Queda en el historial del pedido; el comprador no lo ve.
        </span>
        <FieldError name="note" errors={errors} />
      </div>
      {refundNote ? <p className="notice">{refundNote}</p> : null}
      <p>El stock vuelve a estar disponible y el comprador recibirá un correo con la cancelación.</p>
      <div className="form-actions">
        <button className="btn btn--ghost" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Cancelando…' : 'Cancelar el pedido'}
        </button>
        <Link prefetch={false} className="btn" href={detail}>
          Volver sin cancelar
        </Link>
      </div>
    </form>
  );
}
