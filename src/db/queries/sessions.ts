import { and, eq, ne } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../client';
import { customers, customerSessions } from '../schema';

// Consultas de las sesiones (A2). El token nunca llega aquí: solo su SHA-256.

export type SessionRow = typeof customerSessions.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;

export async function insertSession(
  values: { tokenHash: string; customerId: string; remember: boolean; now: Date; expiresAt: Date },
  db: DbOrTx = getDb(),
): Promise<void> {
  await db.insert(customerSessions).values({
    tokenHash: values.tokenHash,
    customerId: values.customerId,
    remember: values.remember,
    createdAt: values.now,
    lastSeenAt: values.now,
    expiresAt: values.expiresAt,
  });
}

/** Sesión y cliente en una sola consulta. */
export async function findSessionWithCustomer(
  tokenHash: string,
  db: DbOrTx = getDb(),
): Promise<{ session: SessionRow; customer: CustomerRow } | null> {
  const [row] = await db
    .select({ session: customerSessions, customer: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(eq(customerSessions.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export async function touchSession(tokenHash: string, now: Date, db: DbOrTx = getDb()): Promise<void> {
  await db.update(customerSessions).set({ lastSeenAt: now }).where(eq(customerSessions.tokenHash, tokenHash));
}

export async function deleteSession(tokenHash: string, db: DbOrTx = getDb()): Promise<void> {
  await db.delete(customerSessions).where(eq(customerSessions.tokenHash, tokenHash));
}

export async function deleteOtherSessions(customerId: string, keepHash: string, db: DbOrTx = getDb()): Promise<number> {
  const rows = await db
    .delete(customerSessions)
    .where(and(eq(customerSessions.customerId, customerId), ne(customerSessions.tokenHash, keepHash)))
    .returning({ h: customerSessions.tokenHash });
  return rows.length;
}

export async function deleteAllSessions(customerId: string, db: DbOrTx = getDb()): Promise<number> {
  const rows = await db
    .delete(customerSessions)
    .where(eq(customerSessions.customerId, customerId))
    .returning({ h: customerSessions.tokenHash });
  return rows.length;
}
