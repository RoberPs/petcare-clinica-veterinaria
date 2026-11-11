import { sql } from 'drizzle-orm';
import type { Db, Tx } from '@/db/client';

// Transacción de reserva o cambio (B2): bloqueo de transacción por día de la clínica, en orden para
// que dos cambios cruzados no se esperen mutuamente. La restricción appointments_no_overlap es la
// última defensa: su error (23P01) se traduce a "slot_taken".

export type SlotTaken = { status: 'slot_taken' };

/** Código de PostgreSQL de un error, también si Drizzle lo envuelve (cause). */
export function pgErrorCode(error: unknown): string | undefined {
  let e: unknown = error;
  for (let i = 0; i < 3 && e && typeof e === 'object'; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export const EXCLUSION_VIOLATION = '23P01';

export async function withDayLocks<T>(
  db: Db,
  dateIsos: readonly string[],
  fn: (tx: Tx) => Promise<T>,
): Promise<T | SlotTaken> {
  const days = [...new Set(dateIsos)].sort();
  try {
    return await db.transaction(async (tx) => {
      for (const day of days) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking:${day}`}))`);
      }
      return fn(tx);
    });
  } catch (error) {
    if (pgErrorCode(error) === EXCLUSION_VIOLATION) return { status: 'slot_taken' };
    throw error;
  }
}
