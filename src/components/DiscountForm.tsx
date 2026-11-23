'use client';

import { useActionState } from 'react';
import { applyDiscount, removeDiscount } from '@/app/carrito/actions';
import { describedBy, FieldError, fieldId } from './FormParts';
import { useFormFocus } from './useFormFocus';

type State = Awaited<ReturnType<typeof applyDiscount>> | { status: 'idle' };
const IDLE: State = { status: 'idle' };

function errorsOf(state: State): Record<string, string | undefined> {
  switch (state.status) {
    case 'invalid':
      return state.fieldErrors;
    case 'rate_limited': {
      const n = state.retryMinutes;
      return { code: `Has hecho varios intentos seguidos. Vuelve a intentarlo en ${n} ${n === 1 ? 'minuto' : 'minutos'}.` };
    }
    case 'error':
      return { code: 'No hemos podido comprobar el código. Inténtalo de nuevo en unos minutos.' };
    default:
      return {};
  }
}

// Código de descuento del carrito (US9): el error va junto al campo y se anuncia; sin JavaScript,
// el formulario se envía igual y la página vuelve con el estado.
export function DiscountForm({ applied }: { applied: string | null }) {
  const [state, formAction, pending] = useActionState<State, FormData>(applyDiscount, IDLE);
  const { hydrated } = useFormFocus(state);
  if (applied) {
    return (
      <form action={removeDiscount} className="discount-form">
        <p>
          Código aplicado: <strong>{applied}</strong>
        </p>
        <button type="submit" className="btn btn--ghost btn--sm">
          Quitar<span className="visually-hidden"> el código {applied}</span>
        </button>
      </form>
    );
  }
  const errors = errorsOf(state);
  return (
    <form action={formAction} className="discount-form" noValidate={hydrated}>
      <div className={errors.code ? 'field field--invalid' : 'field'}>
        <label htmlFor={fieldId('code')}>Código de descuento</label>
        <input
          id={fieldId('code')}
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={20}
          defaultValue={state.status === 'invalid' ? state.values.code : undefined}
          aria-invalid={errors.code ? true : undefined}
          aria-describedby={describedBy('code', errors)}
        />
        <span role="alert">
          <FieldError name="code" errors={errors} />
        </span>
      </div>
      <button type="submit" className="btn btn--ghost btn--sm" disabled={pending} aria-disabled={pending}>
        Aplicar
      </button>
    </form>
  );
}
