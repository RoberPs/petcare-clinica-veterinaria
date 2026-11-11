import { and, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import { accountTokens, contactMessages, customers, customerSessions, emailOutbox, processedSubmissions, rateLimitHits } from './schema';

// Conservación (FR-030, R15): los mensajes se borran a los 12 meses (su bandeja de salida, en cascada)
// y los registros del límite por origen a las 24 horas.
//
// Feature 002 (A13): cuentas sin verificar a los 7 días (con todo lo suyo, en cascada), sesiones y
// tokens caducados, envíos ya procesados y correos de cuenta enviados o fallidos a las 24 horas.

export interface PurgeResult {
  messages: number;
  hits: number;
  unverifiedAccounts: number;
  sessions: number;
  tokens: number;
  submissions: number;
  accountEmails: number;
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

    return {
      messages: messages.length,
      hits: hits.length,
      unverifiedAccounts: unverified.length,
      sessions: sessions.length,
      tokens: tokens.length,
      submissions: submissions.length,
      accountEmails: accountEmails.length,
    };
  });
}
