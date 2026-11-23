import { eq } from 'drizzle-orm';
import { ACCOUNT_MESSAGES, changePasswordSchema, marketingSchema, profileSchema, validateForm } from '@/domain/account-schemas';
import { getDb } from '@/db/client';
import { getCustomerById } from '@/db/queries/customers';
import { recordHit } from '@/db/queries/rate-limit';
import { customers } from '@/db/schema';
import { enqueueAccountEmail, getAccountEmailContext } from '@/email/outbox';
import { passwordChanged } from '@/email/templates/password-changed';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { revokeOtherSessions } from '@/lib/auth/session';
import { deleteTokens } from '@/lib/auth/tokens';
import { logger } from '@/lib/logger';
import { subscribeFromAccount, unsubscribeFromAccount } from '@/lib/newsletter/sync';
import { checkPolicy, errorCode, formRecord, policyBucket, type FlowContext, type FormState } from './common';

// Datos personales y contraseña (US6). El correo no se puede cambiar desde aquí (FR-029).

export async function processUpdateProfile(form: FormData, customerId: string): Promise<FormState> {
  const validation = validateForm(profileSchema, formRecord(form));
  if (!validation.ok) return { status: 'invalid', ...validation };
  const d = validation.data;
  try {
    await getDb()
      .update(customers)
      .set({
        firstName: d.first_name,
        lastName: d.last_name,
        phone: d.phone,
        addressLine: d.address_line,
        postalCode: d.postal_code,
        city: d.city,
        province: d.province,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId));
    logger.info({ customer_id: customerId }, 'profile_updated');
    return { status: 'ok' };
  } catch (error) {
    logger.error({ customer_id: customerId, code: errorCode(error) }, 'profile_update_failed');
    return { status: 'error' };
  }
}

export interface ChangePasswordOutcome {
  result: FormState;
  outboxIds: string[];
}

/**
 * Cambio de contraseña con la actual. Un fallo cuenta en login_account (A6). Con éxito se cierran
 * las demás sesiones y se conserva la actual (FR-016).
 */
export async function processChangePassword(
  form: FormData,
  customer: { id: string; email: string; firstName: string; sessionHash: string },
  ctx: FlowContext,
): Promise<ChangePasswordOutcome> {
  const validation = validateForm(changePasswordSchema(customer.email), formRecord(form));
  if (!validation.ok) return { result: { status: 'invalid', ...validation }, outboxIds: [] };

  const bucket = policyBucket('login_account', customer.email);
  try {
    const retryMinutes = await checkPolicy('login_account', bucket, ctx.now);
    if (retryMinutes !== null) return { result: { status: 'rate_limited', retryMinutes }, outboxIds: [] };

    const row = await getCustomerById(customer.id);
    if (!row) return { result: { status: 'error' }, outboxIds: [] };
    if (!(await verifyPassword(row.passwordHash, validation.data.current_password)).ok) {
      await recordHit(bucket, ctx.now);
      logger.info({ customer_id: customer.id, code: 'bad_current_password' }, 'password_change_failed');
      return {
        result: { status: 'invalid', fieldErrors: { current_password: ACCOUNT_MESSAGES.current_password_wrong }, values: {} },
        outboxIds: [],
      };
    }

    const passwordHash = await hashPassword(validation.data.password);
    return await getDb().transaction(async (tx) => {
      await tx.update(customers).set({ passwordHash, updatedAt: ctx.now }).where(eq(customers.id, customer.id));
      await revokeOtherSessions(customer.id, customer.sessionHash, tx);
      await deleteTokens(tx, customer.id, 'reset_password');
      const mail = await enqueueAccountEmail(tx, {
        kind: 'password_changed',
        customerId: customer.id,
        to: row.email,
        email: passwordChanged(await getAccountEmailContext(tx), { email: row.email, firstName: row.firstName }, ctx.now),
      });
      logger.info({ customer_id: customer.id }, 'password_changed');
      return { result: { status: 'ok' } as FormState, outboxIds: [mail.id] };
    });
  } catch (error) {
    logger.error({ customer_id: customer.id, code: errorCode(error) }, 'password_change_error');
    return { result: { status: 'error' }, outboxIds: [] };
  }
}

/**
 * Preferencia de consejos y novedades (US8, FR-042). Solo se registra un consentimiento (opt-in u
 * opt-out) y se actualiza la fecha si el valor cambia (lo hace sync.ts, feature 006).
 */
export async function processUpdateMarketing(form: FormData, customerId: string): Promise<FormState> {
  const validation = validateForm(marketingSchema, formRecord(form));
  if (!validation.ok) return { status: 'invalid', ...validation };
  const wanted = validation.data.marketing_opt_in;
  try {
    await getDb().transaction(async (tx) => {
      const [row] = await tx
        .select({ optIn: customers.marketingOptIn })
        .from(customers)
        .where(eq(customers.id, customerId))
        .for('update');
      if (!row) return;
      // Boletín (feature 006, E11): la lista y la preferencia se escriben juntas desde sync.ts. Se
      // llama también si el valor no cambia, para reparar una lista desincronizada.
      const now = new Date();
      if (wanted) await subscribeFromAccount(tx, customerId, now);
      else await unsubscribeFromAccount(tx, customerId, 'account', now);
      if (row.optIn !== wanted) logger.info({ customer_id: customerId, code: wanted ? 'opt_in' : 'opt_out' }, 'marketing_updated');
    });
    return { status: 'ok' };
  } catch (error) {
    logger.error({ customer_id: customerId, code: errorCode(error) }, 'marketing_update_failed');
    return { status: 'error' };
  }
}

