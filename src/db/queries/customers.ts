import { eq } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../client';
import { customers } from '../schema';

// Consultas de clientes. Siempre por id (el de la sesión) o por el correo normalizado.

export type CustomerRow = typeof customers.$inferSelect;

export async function getCustomerById(id: string, db: DbOrTx = getDb()): Promise<CustomerRow | null> {
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return row ?? null;
}

export async function findCustomerByEmail(emailNormalized: string, db: DbOrTx = getDb()): Promise<CustomerRow | null> {
  const [row] = await db.select().from(customers).where(eq(customers.emailNormalized, emailNormalized)).limit(1);
  return row ?? null;
}

/** Bloquea la fila del cliente hasta el final de la transacción (límite de mascotas, A9). */
export async function lockCustomer(id: string, tx: DbOrTx): Promise<CustomerRow | null> {
  const [row] = await tx.select().from(customers).where(eq(customers.id, id)).for('update').limit(1);
  return row ?? null;
}
