import { eq, sql } from 'drizzle-orm';
import { emailOnlySchema, normalizeEmail, validateForm } from '@/domain/account-schemas';
import { getDb } from '@/db/client';
import { findCustomerByEmail } from '@/db/queries/customers';
import { recordHit } from '@/db/queries/rate-limit';
import { customers } from '@/db/schema';
import { enqueueAccountEmail, getAccountEmailContext } from '@/email/outbox';
import { verifyEmail } from '@/email/templates/verify-email';
import { consumeToken, issueToken, peekToken } from '@/lib/auth/tokens';
import { logger } from '@/lib/logger';
import { onAccountVerified } from '@/lib/newsletter/sync';
import { checkPolicy, errorCode, formField, formRecord, policyBucket, type FlowContext, type FormState } from './common';

// Verificación del correo (US1, A4) y reenvío del enlace.

export type VerificationResult =
  | { status: 'ok'; email: string }
  | { status: 'already_verified' }
  | { status: 'expired' }
  | { status: 'error' };

/** POST de "Confirmar mi correo": gasta el token y marca la cuenta como verificada. */
export async function processVerification(form: FormData, ctx: { now: Date }): Promise<VerificationResult> {
  const token = formField(form, 'token');
  try {
    const result = await getDb().transaction(async (tx): Promise<VerificationResult> => {
      const used = await consumeToken(tx, token, 'verify_email', ctx.now);
      if (!used) return { status: 'expired' };
      const [customer] = await tx
        .update(customers)
        .set({ emailVerifiedAt: sql`coalesce(${customers.emailVerifiedAt}, ${ctx.now.toISOString()}::timestamptz)`, updatedAt: ctx.now })
        .where(eq(customers.id, used.customerId))
        .returning({ id: customers.id, email: customers.email });
      if (!customer) return { status: 'expired' };
      // Boletín (feature 006, E11): con la preferencia marcada, alta confirmada sin otro correo.
      await onAccountVerified(tx, customer.id, ctx.now);
      logger.info({ customer_id: customer.id }, 'email_verified');
      return { status: 'ok', email: customer.email };
    });
    if (result.status === 'expired') {
      // Si el enlace ya se usó y la cuenta está verificada, no es un error: se muestra "ya verificada".
      const peek = await peekToken(token, 'verify_email', ctx.now);
      if (peek.status === 'used' && peek.emailVerified) return { status: 'already_verified' };
    }
    return result;
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'verify_email_failed');
    return { status: 'error' };
  }
}

export interface ResendOutcome {
  result: FormState;
  outboxIds: string[];
}

/** Reenvío del enlace. La respuesta es idéntica exista o no la cuenta (y esté o no verificada). */
export async function processResendVerification(form: FormData, ctx: FlowContext): Promise<ResendOutcome> {
  const validation = validateForm(emailOnlySchema, formRecord(form));
  if (!validation.ok) return { result: { status: 'invalid', ...validation }, outboxIds: [] };

  const bucket = policyBucket('auth_origin', ctx.ip);
  try {
    const retryMinutes = await checkPolicy('auth_origin', bucket, ctx.now);
    if (retryMinutes !== null) return { result: { status: 'rate_limited', retryMinutes }, outboxIds: [] };

    return await getDb().transaction(async (tx) => {
      await recordHit(bucket, ctx.now, tx);
      const customer = await findCustomerByEmail(normalizeEmail(validation.data.email), tx);
      if (!customer || customer.emailVerifiedAt) return { result: { status: 'ok' } as FormState, outboxIds: [] };
      const link = await issueToken(tx, customer.id, 'verify_email', ctx.now);
      const mail = await enqueueAccountEmail(tx, {
        kind: 'verify_email',
        customerId: customer.id,
        to: customer.email,
        email: verifyEmail(await getAccountEmailContext(tx), { email: customer.email, firstName: customer.firstName }, link),
      });
      return { result: { status: 'ok' } as FormState, outboxIds: mail.queued ? [mail.id] : [] };
    });
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'resend_verification_failed');
    return { result: { status: 'error' }, outboxIds: [] };
  }
}
