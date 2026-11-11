import { and, count, eq, gt, ne, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { getDb, type DbOrTx } from '@/db/client';
import { recipientHash } from '@/db/queries/contact';
import { clinic, emailOutbox } from '@/db/schema';
import { dispatchById } from './dispatch';
import type { AccountEmailContext } from './templates/account-layout';
import type { OutgoingEmail } from './types';

// Correos de cuenta (A8): se renderizan al encolarlos (el enlace lleva un token que solo existe en
// claro en ese momento) y van a la misma bandeja de salida que los del contacto.

export type AccountEmailKind = 'verify_email' | 'account_exists' | 'password_reset' | 'password_changed' | 'account_deleted';

/** Tipos con límite de 3 por dirección y hora (FR-033). Los avisos de seguridad no se limitan. */
const LIMITED_KINDS: ReadonlySet<AccountEmailKind> = new Set(['verify_email', 'account_exists', 'password_reset']);
export const ACCOUNT_EMAILS_PER_HOUR = 3;

export interface EnqueueResult {
  id: string;
  /** false si se ha superado el límite: la fila queda como skipped_rate_limit y no se envía. */
  queued: boolean;
}

export async function enqueueAccountEmail(
  tx: DbOrTx,
  input: { kind: AccountEmailKind; customerId: string | null; to: string; email: OutgoingEmail },
): Promise<EnqueueResult> {
  const hash = recipientHash(input.to);
  let limited = false;
  if (LIMITED_KINDS.has(input.kind)) {
    // Evita que dos peticiones simultáneas se salten el límite.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.kind}:${hash}`}))`);
    const [recent] = await tx
      .select({ n: count() })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.kind, input.kind),
          eq(emailOutbox.recipientHash, hash),
          ne(emailOutbox.status, 'skipped_rate_limit'),
          gt(emailOutbox.createdAt, sql`now() - interval '1 hour'`),
        ),
      );
    limited = (recent?.n ?? 0) >= ACCOUNT_EMAILS_PER_HOUR;
  }
  const [row] = await tx
    .insert(emailOutbox)
    .values({
      kind: input.kind,
      customerId: input.customerId,
      recipientHash: hash,
      status: limited ? 'skipped_rate_limit' : 'pending',
      payload: limited ? null : { to: input.email.to, subject: input.email.subject, html: input.email.html, text: input.email.text },
    })
    .returning({ id: emailOutbox.id });
  return { id: row!.id, queued: !limited };
}

/** Intento inmediato tras responder (after()). Lo que falle queda para email:dispatch. */
export function sendAccountEmailsNow(ids: (string | null | undefined)[]): void {
  const pending = ids.filter((id): id is string => typeof id === 'string');
  if (pending.length > 0) after(() => dispatchById(pending));
}

/** Datos de la clínica y de la web que necesitan las plantillas de cuenta. */
export async function getAccountEmailContext(db: DbOrTx = getDb()): Promise<AccountEmailContext> {
  const [c] = await db.select({ name: clinic.name, demoBannerEnabled: clinic.demoBannerEnabled }).from(clinic).limit(1);
  if (!c) throw new Error('content_not_loaded');
  return { clinicName: c.name, demoBannerEnabled: c.demoBannerEnabled, siteUrl: (process.env.SITE_URL ?? '').replace(/\/$/, '') };
}
