import { eq, sql } from 'drizzle-orm';
import { emailOnlySchema, newPasswordSchema, normalizeEmail, validateForm } from '@/domain/account-schemas';
import { getDb } from '@/db/client';
import { findCustomerByEmail } from '@/db/queries/customers';
import { recordHit } from '@/db/queries/rate-limit';
import { customers } from '@/db/schema';
import { enqueueAccountEmail, getAccountEmailContext } from '@/email/account-outbox';
import { passwordChanged } from '@/email/templates/password-changed';
import { passwordReset } from '@/email/templates/password-reset';
import { hashPassword } from '@/lib/auth/password';
import { revokeAllSessions } from '@/lib/auth/session';
import { consumeToken, issueToken, peekToken } from '@/lib/auth/tokens';
import { logger } from '@/lib/logger';
import { checkPolicy, errorCode, formField, formRecord, policyBucket, type FlowContext, type FormState } from './common';

// Recuperación de la contraseña (US5, FR-018 a FR-021).

export interface ResetOutcome {
  result: FormState;
  outboxIds: string[];
}

/** "¿Olvidaste tu contraseña?": la respuesta es la misma exista o no la cuenta (FR-018). */
export async function processResetRequest(form: FormData, ctx: FlowContext): Promise<ResetOutcome> {
  const validation = validateForm(emailOnlySchema, formRecord(form));
  if (!validation.ok) return { result: { status: 'invalid', ...validation }, outboxIds: [] };

  const bucket = policyBucket('auth_origin', ctx.ip);
  try {
    const retryMinutes = await checkPolicy('auth_origin', bucket, ctx.now);
    if (retryMinutes !== null) return { result: { status: 'rate_limited', retryMinutes }, outboxIds: [] };

    return await getDb().transaction(async (tx) => {
      await recordHit(bucket, ctx.now, tx);
      const customer = await findCustomerByEmail(normalizeEmail(validation.data.email), tx);
      if (!customer) return { result: { status: 'ok' } as FormState, outboxIds: [] };
      const link = await issueToken(tx, customer.id, 'reset_password', ctx.now);
      const mail = await enqueueAccountEmail(tx, {
        kind: 'password_reset',
        customerId: customer.id,
        to: customer.email,
        email: passwordReset(await getAccountEmailContext(tx), { email: customer.email, firstName: customer.firstName }, link),
      });
      logger.info({ customer_id: customer.id }, 'password_reset_requested');
      return { result: { status: 'ok' } as FormState, outboxIds: mail.queued ? [mail.id] : [] };
    });
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'password_reset_request_failed');
    return { result: { status: 'error' }, outboxIds: [] };
  }
}

/**
 * Nueva contraseña con el enlace: cambia el hash, gasta el token, verifica la cuenta, borra TODAS
 * las sesiones (FR-016) y avisa con password_changed. La validación no gasta el token.
 */
export async function processResetPassword(form: FormData, ctx: { now: Date }): Promise<ResetOutcome> {
  const token = formField(form, 'token');
  const peek = await peekToken(token, 'reset_password', ctx.now);
  if (peek.status !== 'valid') return { result: { status: 'expired' }, outboxIds: [] };

  const validation = validateForm(newPasswordSchema(peek.email), formRecord(form));
  if (!validation.ok) return { result: { status: 'invalid', ...validation }, outboxIds: [] };
  const passwordHash = await hashPassword(validation.data.password);

  try {
    return await getDb().transaction(async (tx): Promise<ResetOutcome> => {
      const used = await consumeToken(tx, token, 'reset_password', ctx.now);
      if (!used) return { result: { status: 'expired' }, outboxIds: [] };
      const [customer] = await tx
        .update(customers)
        .set({
          passwordHash,
          // Quien recibe el enlace en su correo demuestra que es suyo (FR-021).
          emailVerifiedAt: sql`coalesce(${customers.emailVerifiedAt}, ${ctx.now.toISOString()}::timestamptz)`,
          updatedAt: ctx.now,
        })
        .where(eq(customers.id, used.customerId))
        .returning({ id: customers.id, email: customers.email, firstName: customers.firstName });
      if (!customer) return { result: { status: 'expired' }, outboxIds: [] };
      await revokeAllSessions(customer.id, tx);
      const mail = await enqueueAccountEmail(tx, {
        kind: 'password_changed',
        customerId: customer.id,
        to: customer.email,
        email: passwordChanged(await getAccountEmailContext(tx), { email: customer.email, firstName: customer.firstName }, ctx.now),
      });
      logger.info({ customer_id: customer.id }, 'password_reset_completed');
      return { result: { status: 'ok' }, outboxIds: [mail.id] };
    });
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'password_reset_failed');
    return { result: { status: 'error' }, outboxIds: [] };
  }
}
