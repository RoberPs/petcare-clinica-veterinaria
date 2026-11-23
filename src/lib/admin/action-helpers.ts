import { verifySubmissionToken } from '@/lib/form-token';

// Token de envío firmado de los formularios del panel (F3, FR-023): idempotencia de las altas y de
// las acciones sobre citas. El panel no exige el tiempo mínimo anti-robots (cuenta identificada).

export function panelToken(form: FormData, now: Date): { ok: true; submissionId: string } | { ok: false } {
  const t = verifySubmissionToken(form.get('submission'), now, { minAgeMs: 0 });
  return t.ok ? { ok: true, submissionId: t.submissionId } : { ok: false };
}

/** Parte de la query de un aviso: "&clave=valor" solo si hay valor. */
export function noticeQuery(values: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === false || v === 0) continue;
    p.set(k, v === true ? '1' : String(v));
  }
  return p.toString();
}
