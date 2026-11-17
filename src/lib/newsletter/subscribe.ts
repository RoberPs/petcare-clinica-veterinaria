import { eq, sql } from 'drizzle-orm';
import { validateForm } from '@/domain/account-schemas';
import { resendSchema, subscribeSchema } from '@/domain/newsletter-schemas';
import { getDb, type DbOrTx } from '@/db/client';
import { getNewsletterSettings } from '@/db/queries/newsletter';
import { recordHit } from '@/db/queries/rate-limit';
import { newsletterSubscriptions } from '@/db/schema';
import { enqueueEmail, getAccountEmailContext } from '@/email/outbox';
import { newsletterConfirmEmail } from '@/email/templates/newsletter-confirm';
import { checkPolicy, errorCode, formRecord, isHoneypotFilled, policyBucket, type FlowContext } from '@/lib/account/common';
import { claimSubmission } from '@/lib/auth/submission';
import { verifySubmissionToken } from '@/lib/form-token';
import { logger } from '@/lib/logger';
import { newsletterPolicyVersion, type Subscription } from './sync';
import { newConfirmToken } from './tokens';

// Alta en el boletín con doble confirmación (E9). La respuesta es la misma en todos los estados
// (correo nuevo, pendiente o ya confirmado): ningún log ni mensaje los distingue.

export const RESEND_AFTER_MS = 60 * 60 * 1000;

export type NewsletterFormState =
  | { status: 'idle' }
  | { status: 'ok' }
  | { status: 'invalid'; fieldErrors: Record<string, string>; values: Record<string, string> }
  | { status: 'rate_limited'; retryMinutes: number }
  | { status: 'expired' }
  | { status: 'disabled' }
  | { status: 'error' };

export interface SubscribeOutcome {
  result: NewsletterFormState;
  /** Correos encolados que hay que intentar enviar ya (after()). */
  outboxIds: string[];
}

const OK: NewsletterFormState = { status: 'ok' };

/** Envía (o reenvía) el enlace de confirmación a una fila pendiente con un token nuevo. */
async function sendConfirmation(tx: DbOrTx, sub: Pick<Subscription, 'id' | 'email'>, now: Date): Promise<string | null> {
  const token = newConfirmToken(now);
  await tx
    .update(newsletterSubscriptions)
    .set({ confirmTokenHash: token.hash, confirmExpiresAt: token.expiresAt, confirmSentAt: now })
    .where(eq(newsletterSubscriptions.id, sub.id));
  const mail = await enqueueEmail(tx, {
    kind: 'newsletter_confirm',
    to: sub.email,
    email: newsletterConfirmEmail(await getAccountEmailContext(tx), {
      email: sub.email,
      subscriptionId: sub.id,
      token: token.token,
      expiresAt: token.expiresAt,
    }),
  });
  return mail.queued ? mail.id : null;
}

/**
 * Alta (`mode: 'subscribe'`, exige aceptar la política) o petición de otro enlace (`mode: 'resend'`,
 * solo sobre una fila pendiente: nunca crea una nueva).
 */
async function process(form: FormData, ctx: FlowContext, mode: 'subscribe' | 'resend'): Promise<SubscribeOutcome> {
  // 1. Campo trampa: éxito aparente sin guardar nada.
  if (isHoneypotFilled(form)) return { result: OK, outboxIds: [] };

  // 2. Token del formulario: idempotencia y tiempo mínimo.
  const token = verifySubmissionToken(form.get('submission_token'), ctx.now);
  if (!token.ok) return { result: token.reason === 'too_fast' ? OK : { status: 'expired' }, outboxIds: [] };

  const bucket = policyBucket('newsletter_origin', ctx.ip);
  try {
    // 3. Boletín activo (E13).
    if (!(await getNewsletterSettings()).enabled) return { result: { status: 'disabled' }, outboxIds: [] };

    // 4. Límite por origen (5 cada 10 minutos).
    const retryMinutes = await checkPolicy('newsletter_origin', bucket, ctx.now);
    if (retryMinutes !== null) {
      logger.warn({ code: 'newsletter_origin' }, 'newsletter_rate_limited');
      return { result: { status: 'rate_limited', retryMinutes }, outboxIds: [] };
    }
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'newsletter_check_failed');
    return { result: { status: 'error' }, outboxIds: [] };
  }

  // 5. Validación.
  const validation = validateForm(mode === 'subscribe' ? subscribeSchema : resendSchema, formRecord(form));
  if (!validation.ok) return { result: { status: 'invalid', fieldErrors: validation.fieldErrors, values: validation.values }, outboxIds: [] };
  const email = validation.data.email;

  try {
    return await getDb().transaction(async (tx) => {
      const claim = await claimSubmission(tx, token.submissionId, 'newsletter');
      if (claim.status === 'duplicate') return { result: OK, outboxIds: [] };
      await recordHit(bucket, ctx.now, tx);
      // Serializa las altas del mismo correo (la fila puede no existir todavía).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`newsletter:${email}`}))`);
      const [existing] = await tx.select().from(newsletterSubscriptions).where(eq(newsletterSubscriptions.email, email)).for('update');

      if (!existing) {
        if (mode === 'resend') return { result: OK, outboxIds: [] };
        const [row] = await tx
          .insert(newsletterSubscriptions)
          .values({ email, status: 'pending', source: 'form', policyVersion: await newsletterPolicyVersion(tx), createdAt: ctx.now })
          .returning({ id: newsletterSubscriptions.id, email: newsletterSubscriptions.email });
        const id = await sendConfirmation(tx, row!, ctx.now);
        logger.info({ subscription_id: row!.id }, 'newsletter_requested');
        return { result: OK, outboxIds: id ? [id] : [] };
      }

      // Confirmada: nada (ni correo de "ya estabas suscrito").
      if (existing.status === 'confirmed') {
        logger.info({ subscription_id: existing.id }, 'newsletter_requested');
        return { result: OK, outboxIds: [] };
      }

      // Pendiente: un correo como mucho cada hora.
      const recent = existing.confirmSentAt && ctx.now.getTime() - existing.confirmSentAt.getTime() < RESEND_AFTER_MS;
      if (recent) {
        logger.info({ subscription_id: existing.id }, 'newsletter_requested');
        return { result: OK, outboxIds: [] };
      }
      if (mode === 'subscribe') {
        await tx
          .update(newsletterSubscriptions)
          .set({ policyVersion: await newsletterPolicyVersion(tx) })
          .where(eq(newsletterSubscriptions.id, existing.id));
      }
      const id = await sendConfirmation(tx, existing, ctx.now);
      logger.info({ subscription_id: existing.id }, 'newsletter_requested');
      return { result: OK, outboxIds: id ? [id] : [] };
    });
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'newsletter_subscribe_failed');
    return { result: { status: 'error' }, outboxIds: [] };
  }
}

export function subscribe(form: FormData, ctx: FlowContext): Promise<SubscribeOutcome> {
  return process(form, ctx, 'subscribe');
}

export function resendConfirmation(form: FormData, ctx: FlowContext): Promise<SubscribeOutcome> {
  return process(form, ctx, 'resend');
}
