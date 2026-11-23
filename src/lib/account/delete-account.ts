import { and, eq, sql } from 'drizzle-orm';
import { ACCOUNT_MESSAGES, deleteAccountSchema, validateForm } from '@/domain/account-schemas';
import { getDb } from '@/db/client';
import { recordHit } from '@/db/queries/rate-limit';
import { customers, orders } from '@/db/schema';
import { enqueueAccountEmail, getAccountEmailContext } from '@/email/outbox';
import { accountDeleted } from '@/email/templates/account-deleted';
import { verifyPassword } from '@/lib/auth/password';
import { anonymizeCustomerAppointments, cancelForSystem } from '@/lib/booking/cancel';
import { logger } from '@/lib/logger';
import { unsubscribeFromAccount } from '@/lib/newsletter/sync';
import { transitionOrder } from '@/lib/orders/transition';
import { checkPolicy, errorCode, formRecord, policyBucket, type FlowContext, type FormState } from './common';

// Eliminar la cuenta (US7, A12): inmediato y definitivo. En UNA transacción se verifica la
// contraseña, se encola el aviso (sobrevive al borrado por ON DELETE SET NULL) y se borra el cliente,
// que arrastra en cascada mascotas, sesiones, tokens y consentimientos. Los pedidos se desvinculan.

export interface DeleteAccountOutcome {
  result: FormState;
  outboxIds: string[];
}

class WrongPassword extends Error {
  constructor() {
    super('wrong_password');
  }
}

export async function processDeleteAccount(
  form: FormData,
  customer: { id: string; email: string },
  ctx: FlowContext,
): Promise<DeleteAccountOutcome> {
  const validation = validateForm(deleteAccountSchema, formRecord(form));
  if (!validation.ok) return { result: { status: 'invalid', ...validation }, outboxIds: [] };

  const bucket = policyBucket('login_account', customer.email);
  try {
    const retryMinutes = await checkPolicy('login_account', bucket, ctx.now);
    if (retryMinutes !== null) return { result: { status: 'rate_limited', retryMinutes }, outboxIds: [] };

    const outboxIds = await getDb().transaction(async (tx) => {
      const [row] = await tx.select().from(customers).where(eq(customers.id, customer.id)).for('update');
      if (!row) throw new Error('customer_not_found');
      if (!(await verifyPassword(row.passwordHash, validation.data.current_password)).ok)
        throw new WrongPassword();
      const mail = await enqueueAccountEmail(tx, {
        kind: 'account_deleted',
        customerId: row.id,
        to: row.email,
        email: accountDeleted(await getAccountEmailContext(tx), {
          email: row.email,
          firstName: row.firstName,
        }),
      });
      // Citas (feature 003, B12): las futuras se cancelan como "system" (con aviso a la clínica, no al
      // cliente, que ya recibe este correo) y todas se anonimizan antes de borrar el cliente.
      const appointmentEmails = await cancelForSystem(tx, row.id, ctx.now);
      await anonymizeCustomerAppointments(tx, row.id, ctx.now);
      // Pedidos (feature 005, D19): los pendientes se cancelan (libera stock y el uso del código; sin
      // correo, ya va el de la baja) y todos se desvinculan. Se sube access_version para que ningún
      // enlace firmado los muestre; se conservan por obligación legal (D16).
      const pending = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.customerId, row.id), eq(orders.status, 'pending_payment')));
      for (const o of pending) {
        await transitionOrder(tx, o.id, 'cancelled', 'customer', { now: ctx.now, reason: 'account_deleted', skipEmail: true });
      }
      await tx
        .update(orders)
        .set({ customerId: null, accessVersion: sql`${orders.accessVersion} + 1` })
        .where(eq(orders.customerId, row.id));
      // Boletín (feature 006, E11): fuera de la lista con constancia antes de borrar la cuenta.
      await unsubscribeFromAccount(tx, row.id, 'account_deleted', ctx.now);
      await tx.delete(customers).where(eq(customers.id, row.id));
      return [mail.id, ...appointmentEmails];
    });
    logger.info({ customer_id: customer.id }, 'account_deleted');
    return { result: { status: 'ok' }, outboxIds };
  } catch (error) {
    if (error instanceof WrongPassword) {
      // Un fallo cuenta en login_account (A12): no sirve para adivinar la contraseña.
      await recordHit(bucket, ctx.now);
      return {
        result: {
          status: 'invalid',
          fieldErrors: { current_password: ACCOUNT_MESSAGES.current_password_wrong },
          values: {},
        },
        outboxIds: [],
      };
    }
    logger.error({ customer_id: customer.id, code: errorCode(error) }, 'account_delete_failed');
    return { result: { status: 'error' }, outboxIds: [] };
  }
}
