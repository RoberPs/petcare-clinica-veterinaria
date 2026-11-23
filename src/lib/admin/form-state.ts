// Estado de los formularios del panel con useActionState (sin dependencias de servidor: lo importan
// también los componentes de cliente). El éxito hace POST-Redirect-GET y no vuelve aquí.

export type AdminFormValues = Record<string, string | string[]>;

export type AdminFormState =
  | { status: 'idle' }
  | { status: 'invalid'; fieldErrors: Record<string, string>; values: AdminFormValues }
  | { status: 'expired' }
  | { status: 'error' };

export const ADMIN_IDLE: AdminFormState = { status: 'idle' };

/** Valores escritos para volver a pintarlos tras un error (sin el token). */
export function formValues(form: FormData): AdminFormValues {
  const out: AdminFormValues = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== 'string' || k === 'submission' || k.startsWith('$ACTION')) continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}
