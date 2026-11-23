import { and, count, eq, gt, min } from 'drizzle-orm';
import { RATE_POLICIES, type RatePolicyName } from '@/domain/rate-limit';
import { getDb, type DbOrTx } from '../client';
import { rateLimitHits } from '../schema';

// Intentos de las políticas con nombre (A6) sobre rate_limit_hits. El bucket ya llega como HMAC.

export interface WindowHits {
  count: number;
  oldest: Date | null;
}

export async function hitsInWindow(policy: RatePolicyName, bucket: string, now: Date, db: DbOrTx = getDb()): Promise<WindowHits> {
  const since = new Date(now.getTime() - RATE_POLICIES[policy].windowMinutes * 60_000);
  const [row] = await db
    .select({ n: count(), oldest: min(rateLimitHits.hitAt) })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.bucket, bucket), gt(rateLimitHits.hitAt, since)));
  return { count: row?.n ?? 0, oldest: row?.oldest ?? null };
}

export async function recordHit(bucket: string, now: Date, db: DbOrTx = getDb()): Promise<void> {
  await db.insert(rateLimitHits).values({ bucket, hitAt: now });
}
