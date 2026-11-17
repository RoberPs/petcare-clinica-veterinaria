import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { normalizeEmail } from '@/domain/account-schemas';
import type { DbOrTx } from '@/db/client';
import { customerConsents, customers, legalPages, newsletterSubscriptions, newsletterUnsubscribeRecords } from '@/db/schema';
import { logger } from '@/lib/logger';
import { emailHmac } from './hash';

// Sincronización entre la lista del boletín y la preferencia "consejos y novedades" (E11).
// newsletter_subscriptions es la fuente de verdad; customers.marketing_opt_in,
// marketing_opt_in_changed_at y los consentimientos marketing_opt_* son su espejo y SOLO se
// escriben desde este módulo, siempre dentro de la transacción que recibe.

export type UnsubscribeReason = 'link' | 'one_click' | 'account' | 'account_deleted';
export type Subscription = typeof newsletterSubscriptions.$inferSelect;

/** Versión vigente de la política del boletín ('previa' si no hay página, como en el backfill). */
export async function newsletterPolicyVersion(tx: DbOrTx): Promise<string> {
  const [row] = await tx.select({ version: legalPages.version }).from(legalPages).where(eq(legalPages.kind, 'boletin')).limit(1);
  return row?.version ?? 'previa';
}

/**
 * Espejo en la cuenta: preferencia, fecha del cambio y consentimiento. Solo escribe si cambia.
 * Devuelve true si ha cambiado.
 */
async function setMirror(tx: DbOrTx, customerId: string, wanted: boolean, now: Date): Promise<boolean> {
  const [customer] = await tx
    .select({ optIn: customers.marketingOptIn })
    .from(customers)
    .where(eq(customers.id, customerId))
    .for('update');
  if (!customer || customer.optIn === wanted) return false;
  await tx
    .update(customers)
    .set({ marketingOptIn: wanted, marketingOptInChangedAt: now, updatedAt: now })
    .where(eq(customers.id, customerId));
  await tx.insert(customerConsents).values({ customerId, kind: wanted ? 'marketing_opt_in' : 'marketing_opt_out', createdAt: now });
  return true;
}

/**
 * Preferencia de una cuenta sin verificar (registro repetido, 002): se guarda en la cuenta, pero la
 * lista no cambia hasta que verifique el correo (E11).
 */
export async function setUnverifiedPreference(tx: DbOrTx, customerId: string, wanted: boolean, now: Date): Promise<void> {
  await setMirror(tx, customerId, wanted, now);
}

/** Borra la suscripción viva y deja la constancia anónima de la baja, en la misma transacción. */
export async function removeSubscription(tx: DbOrTx, sub: Subscription, reason: UnsubscribeReason, now: Date): Promise<void> {
  await tx.delete(newsletterSubscriptions).where(eq(newsletterSubscriptions.id, sub.id));
  await tx.insert(newsletterUnsubscribeRecords).values({
    emailHmac: emailHmac(sub.email),
    source: sub.source,
    policyVersion: sub.policyVersion,
    subscribedAt: sub.createdAt,
    confirmedAt: sub.confirmedAt,
    unsubscribedAt: now,
    reason,
  });
  logger.info({ subscription_id: sub.id, code: reason }, 'newsletter_unsubscribed');
}

async function lockByCustomer(tx: DbOrTx, customerId: string): Promise<Subscription | undefined> {
  const [row] = await tx.select().from(newsletterSubscriptions).where(eq(newsletterSubscriptions.customerId, customerId)).for('update');
  return row;
}

async function lockByEmail(tx: DbOrTx, email: string): Promise<Subscription | undefined> {
  const [row] = await tx.select().from(newsletterSubscriptions).where(eq(newsletterSubscriptions.email, email)).for('update');
  return row;
}

/**
 * Alta desde la cuenta (verificación con la casilla marcada o "Datos personales"): suscripción
 * confirmada sin correo de confirmación, porque el correo ya está verificado (FR-024). Si había una
 * fila del formulario con ese correo, se vincula y se confirma.
 */
export async function subscribeFromAccount(tx: DbOrTx, customerId: string, now: Date): Promise<void> {
  const [customer] = await tx
    .select({ email: customers.emailNormalized, verifiedAt: customers.emailVerifiedAt })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!customer) return;
  if (!customer.verifiedAt) {
    // Sin verificar: solo la preferencia (E11).
    await setMirror(tx, customerId, true, now);
    return;
  }
  const email = normalizeEmail(customer.email);
  const linked = (await lockByCustomer(tx, customerId)) ?? (await lockByEmail(tx, email));
  if (linked) {
    await tx
      .update(newsletterSubscriptions)
      .set({
        customerId,
        status: 'confirmed',
        confirmedAt: linked.confirmedAt ?? now,
      })
      .where(eq(newsletterSubscriptions.id, linked.id));
    logger.info({ subscription_id: linked.id, code: 'account_link' }, 'newsletter_confirmed');
  } else {
    const [row] = await tx
      .insert(newsletterSubscriptions)
      .values({
        email,
        status: 'confirmed',
        source: 'account',
        customerId,
        policyVersion: await newsletterPolicyVersion(tx),
        createdAt: now,
        confirmedAt: now,
      })
      .returning({ id: newsletterSubscriptions.id });
    logger.info({ subscription_id: row!.id, code: 'account' }, 'newsletter_confirmed');
  }
  await setMirror(tx, customerId, true, now);
}

/** Baja desde la cuenta ("Datos personales" o eliminación): constancia y preferencia desactivada. */
export async function unsubscribeFromAccount(tx: DbOrTx, customerId: string, reason: UnsubscribeReason, now: Date): Promise<void> {
  const sub = await lockByCustomer(tx, customerId);
  if (sub) await removeSubscription(tx, sub, reason, now);
  if (reason !== 'account_deleted') await setMirror(tx, customerId, false, now);
}

/** Baja desde un correo de una suscripción vinculada: la preferencia de la cuenta se desactiva. */
export async function mirrorUnsubscribe(tx: DbOrTx, customerId: string, now: Date): Promise<void> {
  await setMirror(tx, customerId, false, now);
}

/**
 * Confirmación desde el formulario de un correo que coincide con una cuenta verificada: se vincula
 * y se activa la preferencia (escenario 4 de la US5).
 */
export async function linkCustomerOnConfirm(tx: DbOrTx, sub: Subscription, now: Date): Promise<void> {
  if (sub.customerId) {
    await setMirror(tx, sub.customerId, true, now);
    return;
  }
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.emailNormalized, sub.email), sql`${customers.emailVerifiedAt} is not null`))
    .limit(1);
  if (!customer) return;
  const [other] = await tx
    .select({ id: newsletterSubscriptions.id })
    .from(newsletterSubscriptions)
    .where(and(eq(newsletterSubscriptions.customerId, customer.id), ne(newsletterSubscriptions.id, sub.id)))
    .limit(1);
  if (other) return;
  await tx.update(newsletterSubscriptions).set({ customerId: customer.id }).where(eq(newsletterSubscriptions.id, sub.id));
  await setMirror(tx, customer.id, true, now);
}

/**
 * Tras verificar el correo de una cuenta: con la preferencia marcada, alta confirmada; sin ella, si
 * ya había una suscripción confirmada del formulario con ese correo, se vincula (la lista manda).
 */
export async function onAccountVerified(tx: DbOrTx, customerId: string, now: Date): Promise<void> {
  const [customer] = await tx
    .select({ optIn: customers.marketingOptIn, email: customers.emailNormalized })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!customer) return;
  if (customer.optIn) {
    await subscribeFromAccount(tx, customerId, now);
    return;
  }
  const [sub] = await tx
    .select()
    .from(newsletterSubscriptions)
    .where(
      and(
        eq(newsletterSubscriptions.email, normalizeEmail(customer.email)),
        eq(newsletterSubscriptions.status, 'confirmed'),
        isNull(newsletterSubscriptions.customerId),
      ),
    )
    .for('update');
  if (sub) await linkCustomerOnConfirm(tx, sub, now);
}

/**
 * Cambio de correo de la cuenta (FR-026). Hoy el producto no permite cambiar el correo (002): la
 * feature que lo añada debe llamar aquí tras verificar el nuevo. Si el correo nuevo ya tenía una
 * suscripción sin cuenta, se sustituye por la de la cuenta.
 */
export async function moveSubscriptionEmail(tx: DbOrTx, customerId: string, newEmail: string): Promise<void> {
  const email = normalizeEmail(newEmail);
  const sub = await lockByCustomer(tx, customerId);
  if (!sub || sub.email === email) return;
  const clash = await lockByEmail(tx, email);
  if (clash && !clash.customerId) await tx.delete(newsletterSubscriptions).where(eq(newsletterSubscriptions.id, clash.id));
  else if (clash) return;
  await tx.update(newsletterSubscriptions).set({ email }).where(eq(newsletterSubscriptions.id, sub.id));
}
