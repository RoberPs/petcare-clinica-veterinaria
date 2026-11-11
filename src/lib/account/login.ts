import { eq } from 'drizzle-orm';
import { loginSchema, normalizeEmail, validateForm, type FieldErrors, type FormValues } from '@/domain/account-schemas';
import { getDb } from '@/db/client';
import { findCustomerByEmail } from '@/db/queries/customers';
import { recordHit } from '@/db/queries/rate-limit';
import { customers } from '@/db/schema';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/lib/auth/password';
import { startSession } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import { isSafeReturnTo } from '@/lib/return-to';
import { checkPolicy, errorCode, formRecord, policyBucket, type FlowContext } from './common';

// Inicio de sesión (US2, A1, A2 y A6). No crea la cookie: devuelve el token y la Server Action la pone.

export type LoginResult =
  | { status: 'ok'; customerId: string; token: string; remember: boolean }
  | { status: 'invalid'; fieldErrors: FieldErrors; values: FormValues }
  /** Correo o contraseña incorrectos: un único mensaje genérico. */
  | { status: 'credentials'; values: FormValues }
  /** Contraseña correcta, pero la cuenta no está verificada: no hay sesión. */
  | { status: 'unverified'; email: string }
  | { status: 'rate_limited'; retryMinutes: number }
  | { status: 'error' };

/** Destino tras iniciar sesión: return_to si es una ruta interna segura; si no, el área personal. */
export function safeReturnTo(value: unknown): string {
  if (!isSafeReturnTo(value)) return '/mi-cuenta';
  if (value === '/' || value.startsWith('/iniciar-sesion') || value.startsWith('/crear-cuenta')) return '/mi-cuenta';
  return value;
}

/** Apunta un fallo en las dos políticas (por cuenta y por origen). */
async function recordFailure(accountBucket: string, originBucket: string, now: Date): Promise<void> {
  await recordHit(accountBucket, now);
  await recordHit(originBucket, now);
}

export async function processLogin(form: FormData, ctx: FlowContext): Promise<LoginResult> {
  const validation = validateForm(loginSchema, formRecord(form));
  if (!validation.ok) return { status: 'invalid', fieldErrors: validation.fieldErrors, values: validation.values };
  const { email, password, remember } = validation.data;
  const emailNormalized = normalizeEmail(email);
  const values = { email: email.trim() };

  const accountBucket = policyBucket('login_account', emailNormalized);
  const originBucket = policyBucket('login_origin', ctx.ip);

  try {
    // 1. Bloqueo antes de mirar la contraseña: por cuenta (exista o no) y por origen.
    const [byAccount, byOrigin] = await Promise.all([
      checkPolicy('login_account', accountBucket, ctx.now),
      checkPolicy('login_origin', originBucket, ctx.now),
    ]);
    const retryMinutes = Math.max(byAccount ?? 0, byOrigin ?? 0);
    if (retryMinutes > 0) {
      logger.warn({ code: byAccount !== null ? 'login_account' : 'login_origin' }, 'login_blocked');
      return { status: 'rate_limited', retryMinutes };
    }

    // 2. Verificación. Si la cuenta no existe se verifica contra un hash ficticio (mismo tiempo).
    const customer = await findCustomerByEmail(emailNormalized);
    const check = customer ? await verifyPassword(customer.passwordHash, password) : { ok: await verifyAgainstDummy(password), needsRehash: false };
    if (!customer || !check.ok) {
      await recordFailure(accountBucket, originBucket, ctx.now);
      logger.info({ customer_id: customer?.id ?? null, code: 'bad_credentials' }, 'login_failed');
      return { status: 'credentials', values };
    }

    // 3. Contraseña correcta pero sin verificar: no hay sesión (FR-010). No cuenta como fallo.
    if (!customer.emailVerifiedAt) {
      logger.info({ customer_id: customer.id }, 'login_unverified');
      return { status: 'unverified', email: customer.email };
    }

    // 4. Éxito: hash al día y sesión nueva (cada inicio de sesión crea una, A2).
    if (check.needsRehash) {
      await getDb()
        .update(customers)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(customers.id, customer.id));
    }
    const { token } = await startSession(customer.id, remember, ctx.now);
    logger.info({ customer_id: customer.id }, 'login_succeeded');
    return { status: 'ok', customerId: customer.id, token, remember };
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'login_error');
    return { status: 'error' };
  }
}
