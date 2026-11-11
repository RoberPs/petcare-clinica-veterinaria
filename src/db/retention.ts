import { lt, sql } from 'drizzle-orm';
import type { Db } from './client';
import { contactMessages, rateLimitHits } from './schema';

// Conservación (FR-030, R15): los mensajes se borran a los 12 meses (su bandeja de salida, en cascada)
// y los registros del límite por origen a las 24 horas.
export async function purgeExpired(db: Db): Promise<{ messages: number; hits: number }> {
  return db.transaction(async (tx) => {
    const messages = await tx
      .delete(contactMessages)
      .where(lt(contactMessages.purgeAfter, sql`now()`))
      .returning({ id: contactMessages.id });
    const hits = await tx
      .delete(rateLimitHits)
      .where(lt(rateLimitHits.hitAt, sql`now() - interval '24 hours'`))
      .returning({ id: rateLimitHits.id });
    return { messages: messages.length, hits: hits.length };
  });
}
