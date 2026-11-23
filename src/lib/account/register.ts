import { eq, inArray, sql } from 'drizzle-orm';
import { normalizeEmail, registerSchema, validateForm } from '@/domain/account-schemas';
import { getDb } from '@/db/client';
import { recordHit } from '@/db/queries/rate-limit';
import { customerConsents, customers, legalPages } from '@/db/schema';
import { enqueueAccountEmail, getAccountEmailContext } from '@/email/outbox';
import { accountExists } from '@/email/templates/account-exists';
import { verifyEmail } from '@/email/templates/verify-email';
import { hashPassword } from '@/lib/auth/password';
import { claimSubmission } from '@/lib/auth/submission';
import { issueToken } from '@/lib/auth/tokens';
import { verifySubmissionToken } from '@/lib/form-token';
import { logger } from '@/lib/logger';
import { setUnverifiedPreference } from '@/lib/newsletter/sync';
import { checkPolicy, errorCode, formRecord, isHoneypotFilled, policyBucket, type FlowContext, type FormState } from './common';

// Registro (US1, A5). La respuesta es la misma exista o no el correo: "revisa tu correo". Lo que
// cambia es el correo que recibe el dueño de la dirección.

export interface RegistrationOutcome {
  result: FormState;
  /** Correos encolados que hay que intentar enviar ya (after()). */
  outboxIds: string[];
}

const OK: FormState = { status: 'ok' };

export async function processRegistration(form: FormData, ctx: FlowContext): Promise<RegistrationOutcome> {
  // 1. Campo trampa: éxito aparente sin guardar nada.
  if (isHoneypotFilled(form)) return { result: OK, outboxIds: [] };

  // 2. Token del formulario: idempotencia y tiempo mínimo (un envío en menos de 3 s es automatizado).
  const token = verifySubmissionToken(form.get('submission_token'), ctx.now);
  if (!token.ok) return { result: token.reason === 'too_fast' ? OK : { status: 'expired' }, outboxIds: [] };

  // 3. Límite por origen (auth_origin: 10 cada 10 minutos).
  const bucket = policyBucket('auth_origin', ctx.ip);
  try {
    const retryMinutes = await checkPolicy('auth_origin', bucket, ctx.now);
    if (retryMinutes !== null) {
      logger.warn({ code: 'auth_origin' }, 'register_rate_limited');
      return { result: { status: 'rate_limited', retryMinutes }, outboxIds: [] };
    }
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'register_rate_check_failed');
    return { result: { status: 'error' }, outboxIds: [] };
  }

  // 4. Validación (las contraseñas nunca vuelven al formulario).
  const validation = validateForm(registerSchema, formRecord(form));
  if (!validation.ok) return { result: { status: 'invalid', ...validation }, outboxIds: [] };
  const data = validation.data;
  const emailNormalized = normalizeEmail(data.email);

  // 5. El hash se calcula siempre, exista o no la cuenta: el tiempo de respuesta no lo delata.
  const passwordHash = await hashPassword(data.password);

  try {
    return await getDb().transaction(async (tx) => {
      const claim = await claimSubmission(tx, token.submissionId, 'register');
      if (claim.status === 'duplicate') return { result: OK, outboxIds: [] };
      await recordHit(bucket, ctx.now, tx);

      const emailCtx = await getAccountEmailContext(tx);
      const inserted = await tx
        .insert(customers)
        .values({
          email: data.email,
          emailNormalized,
          firstName: data.first_name,
          lastName: data.last_name,
          phone: data.phone,
          passwordHash,
          // La preferencia la escribe sync.ts (feature 006, E11) justo después.
          marketingOptIn: false,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .onConflictDoNothing({ target: customers.emailNormalized })
        .returning({ id: customers.id });

      const versions = await tx
        .select({ kind: legalPages.kind, version: legalPages.version })
        .from(legalPages)
        .where(inArray(legalPages.kind, ['privacidad', 'terminos']));
      const version = (kind: string) => versions.find((v) => v.kind === kind)?.version ?? null;
      const privacyConsent = (customerId: string) => ({
        customerId,
        kind: 'privacy_terms' as const,
        privacyVersion: version('privacidad'),
        termsVersion: version('terminos'),
        createdAt: ctx.now,
      });

      if (inserted.length > 0) {
        const customerId = inserted[0]!.id;
        await tx.insert(customerConsents).values(privacyConsent(customerId));
        // Sin verificar: solo la preferencia; la lista del boletín espera a la verificación.
        if (data.marketing_opt_in) await setUnverifiedPreference(tx, customerId, true, ctx.now);
        const link = await issueToken(tx, customerId, 'verify_email', ctx.now);
        const mail = await enqueueAccountEmail(tx, {
          kind: 'verify_email',
          customerId,
          to: data.email,
          email: verifyEmail(emailCtx, { email: data.email, firstName: data.first_name }, link),
        });
        logger.info({ customer_id: customerId }, 'account_registered');
        return { result: OK, outboxIds: mail.queued ? [mail.id] : [] };
      }

      // El correo ya tiene cuenta.
      const [existing] = await tx.select().from(customers).where(eq(customers.emailNormalized, emailNormalized)).for('update');
      if (!existing) throw new Error('customer_vanished');

      if (existing.emailVerifiedAt) {
        // Verificada: no se toca nada; su dueño recibe un aviso con los enlaces de acceso.
        const mail = await enqueueAccountEmail(tx, {
          kind: 'account_exists',
          customerId: existing.id,
          to: existing.email,
          email: accountExists(emailCtx, { email: existing.email, firstName: existing.firstName }),
        });
        logger.info({ customer_id: existing.id }, 'account_exists_notified');
        return { result: OK, outboxIds: mail.queued ? [mail.id] : [] };
      }

      // Sin verificar: gana el último registro (datos y contraseña nuevos) y se emite un token nuevo.
      // Así nadie puede "reservar" un correo ajeno con su contraseña antes que su dueño.
      await tx
        .update(customers)
        .set({
          email: data.email,
          firstName: data.first_name,
          lastName: data.last_name,
          phone: data.phone,
          passwordHash,
          updatedAt: sql`now()`,
        })
        .where(eq(customers.id, existing.id));
      await tx.insert(customerConsents).values(privacyConsent(existing.id));
      await setUnverifiedPreference(tx, existing.id, data.marketing_opt_in, ctx.now);
      const link = await issueToken(tx, existing.id, 'verify_email', ctx.now);
      const mail = await enqueueAccountEmail(tx, {
        kind: 'verify_email',
        customerId: existing.id,
        to: data.email,
        email: verifyEmail(emailCtx, { email: data.email, firstName: data.first_name }, link),
      });
      logger.info({ customer_id: existing.id, code: 'unverified_retry' }, 'account_registered');
      return { result: OK, outboxIds: mail.queued ? [mail.id] : [] };
    });
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'register_failed');
    return { result: { status: 'error' }, outboxIds: [] };
  }
}
