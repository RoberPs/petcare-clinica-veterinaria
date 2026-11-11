import { randomUUID } from 'node:crypto';
import { sign, verify } from './signing';

// Token del formulario (R5 y R6): submission_id (idempotencia) + sello temporal, firmados con HMAC.
export const TOKEN_MIN_AGE_MS = 3_000;
export const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function createSubmissionToken(now: Date = new Date()): string {
  return sign(JSON.stringify({ id: randomUUID(), t: now.getTime() }));
}

export type TokenCheck =
  | { ok: true; submissionId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_fast' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function verifySubmissionToken(token: unknown, now: Date = new Date()): TokenCheck {
  const payload = verify(typeof token === 'string' ? token : null);
  if (!payload) return { ok: false, reason: 'invalid' };
  try {
    const { id, t } = JSON.parse(payload) as { id?: unknown; t?: unknown };
    if (typeof id !== 'string' || !UUID_RE.test(id) || typeof t !== 'number') return { ok: false, reason: 'invalid' };
    const age = now.getTime() - t;
    if (age < TOKEN_MIN_AGE_MS) return { ok: false, reason: 'too_fast' };
    if (age > TOKEN_MAX_AGE_MS) return { ok: false, reason: 'expired' };
    return { ok: true, submissionId: id };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
