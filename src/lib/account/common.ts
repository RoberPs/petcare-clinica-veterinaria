import { isPolicyLimited, retryAfterMinutes, toPolicyBucket, type RatePolicyName } from '@/domain/rate-limit';
import { hitsInWindow } from '@/db/queries/rate-limit';
import type { DbOrTx } from '@/db/client';
import { requireEnv } from '@/lib/env';

// Tipos y utilidades comunes de los flujos de cuenta (contracts/forms.md). Cada flujo devuelve un
// resultado discriminado; la Server Action lo traduce a una redirección o a un estado del formulario.

export { IDLE, type FormState } from './form-state';

export interface FlowContext {
  ip: string;
  now: Date;
}

/** Los campos de texto de un formulario como objeto, para validarlos con Zod. */
export function formRecord(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === 'string' && !(key in out)) out[key] = value;
  return out;
}

export function formField(form: FormData, name: string): string | undefined {
  const v = form.get(name);
  return typeof v === 'string' ? v : undefined;
}

/** Campo trampa "web": si viene relleno es un robot y se le responde con un éxito aparente. */
export function isHoneypotFilled(form: FormData): boolean {
  return (formField(form, 'web') ?? '').trim() !== '';
}

export function policyBucket(policy: RatePolicyName, key: string): string {
  return toPolicyBucket(policy, key, requireEnv('FORM_SECRET'));
}

/** Comprueba una política. Si está bloqueada devuelve los minutos de espera; si no, null. */
export async function checkPolicy(
  policy: RatePolicyName,
  bucket: string,
  now: Date,
  db?: DbOrTx,
): Promise<number | null> {
  const hits = await hitsInWindow(policy, bucket, now, db);
  if (!isPolicyLimited(policy, hits.count)) return null;
  return retryAfterMinutes(hits.oldest ?? now, policy, now);
}

export const errorCode = (error: unknown) => (error instanceof Error ? error.message.slice(0, 80) : 'unknown');
