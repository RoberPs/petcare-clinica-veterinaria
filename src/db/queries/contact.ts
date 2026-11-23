import { createHash } from 'node:crypto';
import { and, asc, count, eq, gt, ne, sql } from 'drizzle-orm';
import type { ContactInput } from '@/domain/contact-schema';
import { RATE_LIMIT } from '@/domain/rate-limit';
import { getDb, type Db } from '../client';
import { clinic, contactMessages, contactReasons, emailOutbox, legalPages, rateLimitHits } from '../schema';

export const RETENTION_MONTHS = 12;

/** SHA-256 de la dirección normalizada (minúsculas): limita los acuses sin buscar el correo en claro. */
export function recipientHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export async function getContactReasons(db: Db = getDb()) {
  return db
    .select({ id: contactReasons.id, slug: contactReasons.slug, label: contactReasons.label })
    .from(contactReasons)
    .where(eq(contactReasons.published, true))
    .orderBy(asc(contactReasons.position), asc(contactReasons.slug));
}

export async function findReason(slug: string, db: Db = getDb()) {
  const [row] = await db
    .select({ id: contactReasons.id, label: contactReasons.label })
    .from(contactReasons)
    .where(and(eq(contactReasons.slug, slug), eq(contactReasons.published, true)))
    .limit(1);
  return row ?? null;
}

/** Envíos del mismo origen en la ventana del límite (10 minutos). */
export async function countRecentHits(bucket: string, db: Db = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.bucket, bucket),
        gt(rateLimitHits.hitAt, sql`now() - make_interval(mins => ${RATE_LIMIT.windowMinutes})`),
      ),
    );
  return row?.n ?? 0;
}

export interface CreateContactMessageInput {
  submissionId: string;
  data: ContactInput;
  reason: { id: string; label: string };
  bucket: string;
}

export interface CreateContactMessageResult {
  id: string;
  created: boolean;
}

/**
 * Registra el mensaje y sus correos en UNA transacción (R7, contracts/contact-form.md):
 * contact_messages (idempotente por submission_id), email_outbox (clinic_notification y visitor_ack
 * o skipped_rate_limit) y rate_limit_hits.
 */
export async function createContactMessage(
  input: CreateContactMessageInput,
  db: Db = getDb(),
): Promise<CreateContactMessageResult> {
  return db.transaction(async (tx) => {
    const [privacy] = await tx
      .select({ version: legalPages.version })
      .from(legalPages)
      .where(eq(legalPages.kind, 'privacidad'))
      .limit(1);
    const [clinicRow] = await tx.select({ inboxEmail: clinic.inboxEmail }).from(clinic).limit(1);
    if (!privacy || !clinicRow) throw new Error('content_not_loaded');

    const inserted = await tx
      .insert(contactMessages)
      .values({
        submissionId: input.submissionId,
        name: input.data.nombre,
        phone: input.data.telefono,
        email: input.data.email,
        reasonId: input.reason.id,
        reasonLabel: input.reason.label,
        message: input.data.mensaje,
        privacyAcceptedAt: sql`now()`,
        privacyVersion: privacy.version,
        purgeAfter: sql`now() + make_interval(months => ${RETENTION_MONTHS})`,
      })
      .onConflictDoNothing({ target: contactMessages.submissionId })
      .returning({ id: contactMessages.id });

    if (inserted.length === 0) {
      // Reenvío del mismo formulario: no se crea nada nuevo (FR-026).
      const [existing] = await tx
        .select({ id: contactMessages.id })
        .from(contactMessages)
        .where(eq(contactMessages.submissionId, input.submissionId));
      return { id: existing!.id, created: false };
    }
    const messageId = inserted[0]!.id;
    const visitorHash = recipientHash(input.data.email);

    // Un acuse por dirección y hora (FR-025a). El bloqueo evita la carrera entre dos envíos simultáneos.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${visitorHash}))`);
    const [recentAck] = await tx
      .select({ n: count() })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.kind, 'visitor_ack'),
          eq(emailOutbox.recipientHash, visitorHash),
          ne(emailOutbox.status, 'skipped_rate_limit'),
          gt(emailOutbox.createdAt, sql`now() - interval '1 hour'`),
        ),
      );

    await tx.insert(emailOutbox).values([
      { contactMessageId: messageId, kind: 'clinic_notification', recipientHash: recipientHash(clinicRow.inboxEmail) },
      {
        contactMessageId: messageId,
        kind: 'visitor_ack',
        recipientHash: visitorHash,
        status: (recentAck?.n ?? 0) > 0 ? 'skipped_rate_limit' : 'pending',
      },
    ]);
    await tx.insert(rateLimitHits).values({ bucket: input.bucket });
    return { id: messageId, created: true };
  });
}
