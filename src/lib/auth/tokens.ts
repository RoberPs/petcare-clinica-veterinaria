import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/db/client';
import { accountTokens, customers } from '@/db/schema';
import { hashToken } from './session';

// Enlaces de un solo uso (A4): verificación del correo (24 h) y recuperación de la contraseña (1 h).
// Solo se guarda el SHA-256. La página del enlace (GET) solo los mira con peekToken; se gastan con
// consumeToken desde un POST, para que los escáneres de correo no los consuman.

export type TokenPurpose = 'verify_email' | 'reset_password';

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

/** Emite un token nuevo y borra los anteriores del mismo cliente y propósito. Devuelve el token en claro. */
export async function issueToken(tx: DbOrTx, customerId: string, purpose: TokenPurpose, now: Date = new Date()): Promise<string> {
  await tx.delete(accountTokens).where(and(eq(accountTokens.customerId, customerId), eq(accountTokens.purpose, purpose)));
  const token = randomBytes(32).toString('base64url');
  await tx.insert(accountTokens).values({
    tokenHash: hashToken(token),
    customerId,
    purpose,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
  });
  return token;
}

export type PeekResult =
  | { status: 'valid'; customerId: string; email: string; emailVerified: boolean }
  /** Ya se usó, o la cuenta ya está verificada (verify_email): se muestra "ya verificada". */
  | { status: 'used'; customerId: string; emailVerified: boolean }
  | { status: 'expired' }
  | { status: 'invalid' };

const looksLikeToken = (token: unknown): token is string =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(token);

/** Solo comprueba el token, sin gastarlo (GET de la página del enlace). */
export async function peekToken(
  token: unknown,
  purpose: TokenPurpose,
  now: Date = new Date(),
  db: DbOrTx = getDb(),
): Promise<PeekResult> {
  if (!looksLikeToken(token)) return { status: 'invalid' };
  const [row] = await db
    .select({
      customerId: accountTokens.customerId,
      expiresAt: accountTokens.expiresAt,
      usedAt: accountTokens.usedAt,
      email: customers.email,
      emailVerifiedAt: customers.emailVerifiedAt,
    })
    .from(accountTokens)
    .innerJoin(customers, eq(customers.id, accountTokens.customerId))
    .where(and(eq(accountTokens.tokenHash, hashToken(token)), eq(accountTokens.purpose, purpose)))
    .limit(1);
  if (!row) return { status: 'invalid' };
  const emailVerified = row.emailVerifiedAt !== null;
  if (row.usedAt) return { status: 'used', customerId: row.customerId, emailVerified };
  if (purpose === 'verify_email' && emailVerified) return { status: 'used', customerId: row.customerId, emailVerified };
  if (row.expiresAt.getTime() <= now.getTime()) return { status: 'expired' };
  return { status: 'valid', customerId: row.customerId, email: row.email, emailVerified };
}

/**
 * Gasta el token de forma atómica: solo una petición puede marcarlo como usado. Devuelve el cliente,
 * o null si no existe, ya se usó o ha caducado.
 */
export async function consumeToken(
  tx: DbOrTx,
  token: unknown,
  purpose: TokenPurpose,
  now: Date = new Date(),
): Promise<{ customerId: string } | null> {
  if (!looksLikeToken(token)) return null;
  const [row] = await tx
    .update(accountTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(accountTokens.tokenHash, hashToken(token)),
        eq(accountTokens.purpose, purpose),
        isNull(accountTokens.usedAt),
        gt(accountTokens.expiresAt, now),
      ),
    )
    .returning({ customerId: accountTokens.customerId });
  return row ?? null;
}

/** Borra todos los tokens de un propósito (por ejemplo, los de recuperación tras cambiar la contraseña). */
export async function deleteTokens(tx: DbOrTx, customerId: string, purpose: TokenPurpose): Promise<void> {
  await tx.delete(accountTokens).where(and(eq(accountTokens.customerId, customerId), eq(accountTokens.purpose, purpose)));
}
