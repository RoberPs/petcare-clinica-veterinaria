import { and, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import {
  accountTokens,
  appointments,
  bookingSettings,
  carts,
  contactMessages,
  customers,
  customerSessions,
  emailOutbox,
  orders,
  paymentEvents,
  processedSubmissions,
  rateLimitHits,
  shopSettings,
} from './schema';

// Conservación (FR-030, R15): los mensajes se borran a los 12 meses (su bandeja de salida, en cascada)
// y los registros del límite por origen a las 24 horas.
//
// Feature 002 (A13): cuentas sin verificar a los 7 días (con todo lo suyo, en cascada), sesiones y
// tokens caducados, envíos ya procesados y correos de cuenta enviados o fallidos a las 24 horas.
//
// Feature 003 (B12, FR-030): las citas de invitado se anonimizan cuando su fecha tiene más de
// retention_months (12 por defecto). Los correos de cita cerrados se borran a las 24 h con los de
// cuenta (ninguno tiene mensaje de contacto). Las citas de cliente se anonimizan al borrar la cuenta.
//
// Feature 005 (D16): carritos de invitado sin cambios en cart_retention_days (con sus líneas, en
// cascada), avisos de la pasarela de más de 90 días y pedidos de más de 6 años anonimizados (se
// conservan importes y líneas). Los correos de pedido cerrados caen con la regla de las 24 h.

export interface PurgeResult {
  messages: number;
  hits: number;
  unverifiedAccounts: number;
  sessions: number;
  tokens: number;
  submissions: number;
  accountEmails: number;
  guestAppointments: number;
  guestCarts: number;
  paymentEvents: number;
  anonymizedOrders: number;
}

export async function purgeExpired(db: Db): Promise<PurgeResult> {
  return db.transaction(async (tx) => {
    const messages = await tx
      .delete(contactMessages)
      .where(lt(contactMessages.purgeAfter, sql`now()`))
      .returning({ id: contactMessages.id });
    const hits = await tx
      .delete(rateLimitHits)
      .where(lt(rateLimitHits.hitAt, sql`now() - interval '24 hours'`))
      .returning({ id: rateLimitHits.id });

    const unverified = await tx
      .delete(customers)
      .where(and(isNull(customers.emailVerifiedAt), lt(customers.createdAt, sql`now() - interval '7 days'`)))
      .returning({ id: customers.id });
    // Caducadas por fecha absoluta o, sin "Recordarme", por 2 h de inactividad (A2).
    const sessions = await tx
      .delete(customerSessions)
      .where(
        or(
          lt(customerSessions.expiresAt, sql`now()`),
          and(sql`${customerSessions.remember} = false`, lt(customerSessions.lastSeenAt, sql`now() - interval '2 hours'`)),
        ),
      )
      .returning({ h: customerSessions.tokenHash });
    const tokens = await tx
      .delete(accountTokens)
      .where(or(lt(accountTokens.expiresAt, sql`now()`), lt(accountTokens.usedAt, sql`now() - interval '24 hours'`)))
      .returning({ h: accountTokens.tokenHash });
    const submissions = await tx
      .delete(processedSubmissions)
      .where(lt(processedSubmissions.createdAt, sql`now() - interval '24 hours'`))
      .returning({ id: processedSubmissions.submissionId });
    // Correos de cuenta (sin mensaje de contacto) ya cerrados: sent, failed o skipped_rate_limit.
    const accountEmails = await tx
      .delete(emailOutbox)
      .where(
        and(
          isNull(emailOutbox.contactMessageId),
          sql`${emailOutbox.status} <> 'pending'`,
          lt(emailOutbox.createdAt, sql`now() - interval '24 hours'`),
        ),
      )
      .returning({ id: emailOutbox.id });

    const [settings] = await tx.select({ months: bookingSettings.retentionMonths }).from(bookingSettings).limit(1);
    const months = settings?.months ?? 12;
    const guestAppointments = await tx
      .update(appointments)
      .set({
        contactName: null,
        contactEmail: null,
        contactEmailNormalized: null,
        contactPhone: null,
        reason: null,
        anonymizedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          sql`${appointments.bookedAs} = 'guest'`,
          isNull(appointments.anonymizedAt),
          lt(appointments.startsAt, sql`now() - make_interval(months => ${months})`),
        ),
      )
      .returning({ id: appointments.id });

    const [shop] = await tx.select({ days: shopSettings.cartRetentionDays }).from(shopSettings).limit(1);
    const cartDays = shop?.days ?? 30;
    const guestCarts = await tx
      .delete(carts)
      .where(and(isNull(carts.customerId), lt(carts.updatedAt, sql`now() - make_interval(days => ${cartDays})`)))
      .returning({ id: carts.id });
    const events = await tx
      .delete(paymentEvents)
      .where(lt(paymentEvents.receivedAt, sql`now() - interval '90 days'`))
      .returning({ id: paymentEvents.providerEventId });
    const anonymizedOrders = await tx
      .update(orders)
      .set({
        contactEmail: null,
        contactEmailNormalized: null,
        firstName: null,
        lastName: null,
        addressLine: null,
        postalCode: null,
        city: null,
        anonymizedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(and(isNull(orders.anonymizedAt), lt(orders.createdAt, sql`now() - interval '6 years'`)))
      .returning({ id: orders.id });

    return {
      messages: messages.length,
      hits: hits.length,
      unverifiedAccounts: unverified.length,
      sessions: sessions.length,
      tokens: tokens.length,
      submissions: submissions.length,
      accountEmails: accountEmails.length,
      guestAppointments: guestAppointments.length,
      guestCarts: guestCarts.length,
      paymentEvents: events.length,
      anonymizedOrders: anonymizedOrders.length,
    };
  });
}
