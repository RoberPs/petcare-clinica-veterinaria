'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ADMIN_IDLE, type AdminFormState } from '@/lib/admin/form-state';
import { describedBy, ErrorSummary, FieldError, fieldId, formMessage, TextField } from '../FormParts';
import { useFormFocus } from '../useFormFocus';

interface Props {
  action: (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
  submissionToken: string;
}

const LABELS = {
  code: 'Código',
  kind: 'Tipo',
  value: 'Valor',
  starts_on: 'Desde',
  ends_on: 'Hasta',
  min_subtotal: 'Pedido mínimo',
  max_uses: 'Usos máximos',
};

// Alta de un código de descuento (US6, escenarios 1 y 2). Un código no se edita después: solo se
// activa o desactiva. Funciona sin JavaScript.
export function DiscountForm({ action, submissionToken }: Props) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, ADMIN_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const invalid = state.status === 'invalid';
  const errors = invalid ? state.fieldErrors : {};
  const values = invalid ? state.values : {};
  const str = (k: string) => (typeof values[k] === 'string' ? (values[k] as string) : undefined);
  const kind = str('kind') ?? 'percent';
  return (
    <form key={invalid ? JSON.stringify(values) : state.status} className="panel form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={formMessage(state, '/admin/descuentos/nuevo')} />
      <input type="hidden" name="submission" value={submissionToken} />
      <TextField
        name="code"
        label="Código"
        required
        maxLength={30}
        defaultValue={str('code')}
        hint="De 3 a 20 letras (sin tildes) o números. Se guarda en mayúsculas y no se puede cambiar después."
        errors={errors}
      />
      <fieldset className="choice-list" id={fieldId('kind')} aria-describedby={describedBy('kind', errors)}>
        <legend>Tipo</legend>
        <label>
          <input type="radio" name="kind" value="percent" defaultChecked={kind === 'percent'} />
          <span>Porcentaje sobre los productos</span>
        </label>
        <label>
          <input type="radio" name="kind" value="fixed" defaultChecked={kind === 'fixed'} />
          <span>Importe fijo en euros</span>
        </label>
        <FieldError name="kind" errors={errors} />
      </fieldset>
      <TextField
        name="value"
        label="Valor"
        inputMode="text"
        required
        defaultValue={str('value')}
        hint="Porcentaje: un número entero de 1 a 100. Importe: euros, por ejemplo 5 o 7,50."
        errors={errors}
      />
      <TextField name="starts_on" label="Desde" type="date" optional defaultValue={str('starts_on')} hint="Empieza a las 00:00 de ese día." errors={errors} />
      <TextField name="ends_on" label="Hasta" type="date" optional defaultValue={str('ends_on')} hint="Termina a las 23:59 de ese día." errors={errors} />
      <TextField name="min_subtotal" label="Pedido mínimo en euros" inputMode="text" optional defaultValue={str('min_subtotal')} errors={errors} />
      <TextField name="max_uses" label="Usos máximos" type="number" inputMode="numeric" optional min="1" defaultValue={str('max_uses')} errors={errors} />
      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Guardando…' : 'Crear el código'}
        </button>
        <Link prefetch={false} className="btn btn--ghost" href="/admin/descuentos">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
