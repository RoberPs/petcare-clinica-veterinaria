import { and, asc, eq, lte } from 'drizzle-orm';
import { summarizeHours } from '@/domain/hours';
import { getDb, type Db } from '@/db/client';
import { clinic, contactMessages, emailOutbox, openingHours } from '@/db/schema';
import { logger } from '@/lib/logger';
import { getEmailProvider } from './provider';
import { clinicNotification } from './templates/clinic-notification';
import { visitorAck } from './templates/visitor-ack';
import type { EmailClinic, EmailProvider } from './types';

// Envío de la bandeja de salida (R7): intento inmediato y reintentos con espera creciente.

export const MAX_ATTEMPTS = 8;
const MINUTE = 60_000;
/** Espera tras el fallo n (1-based): 1, 5, 15 y 60 minutos y después cada 6 horas (8 intentos ≈ 24 h). */
export function backoffMs(failedAttempts: number): number {
  const schedule = [1, 5, 15, 60];
  return (schedule[failedAttempts - 1] ?? 360) * MINUTE;
}

type OutboxRow = typeof emailOutbox.$inferSelect;

async function loadEmailClinic(db: Db): Promise<EmailClinic> {
  const [c] = await db.select().from(clinic).limit(1);
  if (!c) throw new Error('content_not_loaded');
  const hours = await db
    .select({ weekday: openingHours.weekday, opensAt: openingHours.opensAt, closesAt: openingHours.closesAt })
    .from(openingHours);
  const siteUrl = (process.env.SITE_URL ?? '').replace(/\/$/, '');
  return {
    name: c.name,
    inboxEmail: c.inboxEmail,
    phoneDisplay: c.phoneDisplay,
    phoneE164: c.phoneE164,
    responseTimeText: c.responseTimeText,
    demoBannerEnabled: c.demoBannerEnabled,
    hoursSummary: summarizeHours(hours).map((l) => `${l.days}: ${l.hours}`),
    privacyUrl: `${siteUrl}/privacidad`,
  };
}

async function processRow(db: Db, row: OutboxRow, provider: EmailProvider, emailClinic: EmailClinic, now: Date) {
  const [msg] = await db.select().from(contactMessages).where(eq(contactMessages.id, row.contactMessageId));
  if (!msg) return; // purgado: la fila desaparece en cascada
  const email =
    row.kind === 'clinic_notification'
      ? clinicNotification(emailClinic, msg)
      : visitorAck(emailClinic, { name: msg.name, email: msg.email });

  const result = await provider.send(email);
  const attempts = row.attempts + 1;

  if (result.ok) {
    await db
      .update(emailOutbox)
      .set({ status: 'sent', attempts, sentAt: now, providerMessageId: result.providerMessageId ?? null, lastErrorCode: null })
      .where(eq(emailOutbox.id, row.id));
    logger.info({ outbox_id: row.id, message_id: row.contactMessageId, kind: row.kind, attempts }, 'email_sent');
    return;
  }

  const final = !result.retryable || attempts >= MAX_ATTEMPTS;
  await db
    .update(emailOutbox)
    .set({
      status: final ? 'failed' : 'pending',
      attempts,
      lastErrorCode: result.code,
      nextAttemptAt: final ? row.nextAttemptAt : new Date(now.getTime() + backoffMs(attempts)),
    })
    .where(eq(emailOutbox.id, row.id));
  const log = { outbox_id: row.id, message_id: row.contactMessageId, kind: row.kind, attempts, code: result.code };
  if (final) logger.error(log, 'email_failed');
  else logger.warn(log, 'email_retry_scheduled');
}

/**
 * Procesa hasta `limit` correos pendientes cuyo turno ha llegado. Cada fila se bloquea con
 * FOR UPDATE SKIP LOCKED dentro de su propia transacción, así que varios procesos no envían dos veces.
 */
export async function dispatchPending(
  options: { limit?: number; messageId?: string; provider?: EmailProvider; db?: Db; now?: () => Date } = {},
): Promise<{ processed: number }> {
  const db = options.db ?? getDb();
  const provider = options.provider ?? getEmailProvider();
  const clock = options.now ?? (() => new Date());
  const limit = options.limit ?? 50;
  const emailClinic = await loadEmailClinic(db);
  let processed = 0;

  while (processed < limit) {
    const done = await db.transaction(async (tx) => {
      const now = clock();
      const filters = [eq(emailOutbox.status, 'pending'), lte(emailOutbox.nextAttemptAt, now)];
      if (options.messageId) filters.push(eq(emailOutbox.contactMessageId, options.messageId));
      const [row] = await tx
        .select()
        .from(emailOutbox)
        .where(and(...filters))
        .orderBy(asc(emailOutbox.nextAttemptAt))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!row) return true;
      await processRow(tx as unknown as Db, row, provider, emailClinic, now);
      return false;
    });
    if (done) break;
    processed++;
  }
  return { processed };
}

/** Intento inmediato tras registrar un mensaje. Los fallos quedan para email:dispatch. */
export async function dispatchForMessage(messageId: string): Promise<void> {
  try {
    await dispatchPending({ messageId, limit: 2 });
  } catch (error) {
    logger.error({ message_id: messageId, code: error instanceof Error ? error.message : 'unknown' }, 'email_dispatch_error');
  }
}
