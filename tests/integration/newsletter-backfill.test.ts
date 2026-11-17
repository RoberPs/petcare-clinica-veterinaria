import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCustomer, q, resetAccountState, setupTestDb, teardownTestDb } from './helpers/db';

// Backfill de la migración 0005 (E12, FR-028): los clientes con la preferencia y el correo
// verificado pasan a la lista como confirmados, con la versión "previa". Idempotente.

const BACKFILL = (() => {
  const sql = readFileSync('drizzle/0005_health_tips_newsletter.sql', 'utf8');
  const start = sql.indexOf('INSERT INTO "newsletter_subscriptions"');
  if (start < 0) throw new Error('la migración 0005 no tiene el backfill');
  return sql.slice(start);
})();

describe('backfill del boletín (E12)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await resetAccountState();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('inserta solo a los clientes con la preferencia y el correo verificado', async () => {
    const yes = await createCustomer({ email: 'Si@Example.test', marketingOptIn: true, verified: true });
    await createCustomer({ email: 'no-verificado@example.test', marketingOptIn: true, verified: false });
    await createCustomer({ email: 'sin-preferencia@example.test', marketingOptIn: false, verified: true });
    await q(BACKFILL);
    const rows = await q('SELECT email, status, source, customer_id, policy_version, confirmed_at FROM newsletter_subscriptions');
    expect(rows).toMatchObject([{ email: 'si@example.test', status: 'confirmed', source: 'account', customer_id: yes.id, policy_version: 'previa' }]);
    expect(rows[0]!.confirmed_at).toBeInstanceOf(Date);
  });

  it('es idempotente', async () => {
    await createCustomer({ marketingOptIn: true, verified: true });
    await q(BACKFILL);
    await q(BACKFILL);
    expect(await q('SELECT id FROM newsletter_subscriptions')).toHaveLength(1);
  });
});
