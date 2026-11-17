import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { purgeExpired } from '@/db/retention';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { createSubscription } from './helpers/newsletter';

// Conservación del boletín (E15): suscripciones sin confirmar a los 30 días y constancias de baja
// a los 3 años. Las confirmadas no caducan.

const DAY = 24 * 60 * 60 * 1000;

async function insertRecord(unsubscribedAt: string): Promise<void> {
  await q(
    `INSERT INTO newsletter_unsubscribe_records
       (email_hmac, source, policy_version, subscribed_at, confirmed_at, unsubscribed_at, reason)
     VALUES (md5(random()::text), 'form', '1.0', now() - interval '4 years', null, ${unsubscribedAt}, 'link')`,
  );
}

describe('retention:purge · boletín', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('borra las suscripciones pending de más de 30 días, sin constancia; no las recientes ni las confirmadas', async () => {
    const now = Date.now();
    await createSubscription({ email: 'vieja@example.test', createdAt: new Date(now - 31 * DAY) });
    const recent = await createSubscription({ email: 'reciente@example.test', createdAt: new Date(now - 29 * DAY) });
    const confirmed = await createSubscription({ email: 'confirmada@example.test', status: 'confirmed', createdAt: new Date(now - 400 * DAY) });

    const result = await purgeExpired(getDb());
    expect(result.pendingSubscriptions).toBe(1);
    const ids = (await q<{ id: string }>('SELECT id FROM newsletter_subscriptions')).map((r) => r.id).sort();
    expect(ids).toEqual([recent.id, confirmed.id].sort());
    expect(await q('SELECT count(*)::int AS n FROM newsletter_unsubscribe_records')).toEqual([{ n: 0 }]);
  });

  it('borra las constancias de baja de más de 3 años', async () => {
    await insertRecord(`now() - interval '3 years 1 day'`);
    await insertRecord(`now() - interval '3 years' + interval '1 day'`);

    expect((await purgeExpired(getDb())).unsubscribeRecords).toBe(1);
    expect(await q('SELECT count(*)::int AS n FROM newsletter_unsubscribe_records')).toEqual([{ n: 1 }]);
  });
});
