import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb, getPool } from '@/db/client';
import { purgeExpired } from '@/db/retention';
import { enqueueAccountEmail } from '@/email/account-outbox';
import { createCustomer, createPet, createSessionFor, q, resetAccountState, setupTestDb, teardownTestDb } from './helpers/db';

// Purgas de la feature 002 (A13).

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

describe('purga de cuentas (A13)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await resetAccountState();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('borra las cuentas sin verificar de más de 7 días (con lo suyo) y conserva el resto', async () => {
    const old = await createCustomer({ verified: false, createdAt: ago(8 * 24 * HOUR) });
    await createPet(old.id);
    const recent = await createCustomer({ verified: false, createdAt: ago(6 * 24 * HOUR) });
    const verifiedOld = await createCustomer({ verified: true, createdAt: ago(30 * 24 * HOUR) });

    const result = await purgeExpired(getDb());
    expect(result.unverifiedAccounts).toBe(1);
    const ids = (await q('SELECT id FROM customers')).map((r) => r.id).sort();
    expect(ids).toEqual([recent.id, verifiedOld.id].sort());
    expect(await q('SELECT id FROM pets')).toEqual([]);
    expect(await q('SELECT id FROM customer_consents WHERE customer_id = $1', [old.id])).toEqual([]);
  });

  it('borra las sesiones caducadas por fecha o por inactividad, y conserva las vigentes', async () => {
    const c = await createCustomer();
    await createSessionFor(c.id, true, ago(31 * 24 * HOUR)); // caducada (30 días)
    await createSessionFor(c.id, false, ago(3 * HOUR)); // 3 h sin actividad, sin "Recordarme"
    await createSessionFor(c.id, true, ago(3 * HOUR)); // con "Recordarme": la inactividad no la cierra
    await createSessionFor(c.id, false); // vigente
    const result = await purgeExpired(getDb());
    expect(result.sessions).toBe(2);
    expect(await q('SELECT count(*)::int AS n FROM customer_sessions')).toEqual([{ n: 2 }]);
  });

  it('borra los tokens caducados o usados hace más de 24 h y los envíos procesados de más de 24 h', async () => {
    const c = await createCustomer();
    const pool = getPool();
    await pool.query(
      `INSERT INTO account_tokens (token_hash, customer_id, purpose, expires_at, used_at, created_at) VALUES
        ('caducado', $1, 'verify_email', now() - interval '1 minute', null, now() - interval '2 days'),
        ('usado-viejo', $1, 'reset_password', now() + interval '1 hour', now() - interval '25 hours', now() - interval '25 hours'),
        ('vigente', $1, 'verify_email', now() + interval '1 hour', null, now())`,
      [c.id],
    );
    await pool.query(
      `INSERT INTO processed_submissions (submission_id, scope, created_at) VALUES
        (gen_random_uuid(), 'register', now() - interval '25 hours'), (gen_random_uuid(), 'pet_create', now())`,
    );
    const result = await purgeExpired(getDb());
    expect(result.tokens).toBe(2);
    expect(result.submissions).toBe(1);
    expect(await q('SELECT token_hash FROM account_tokens')).toEqual([{ token_hash: 'vigente' }]);
  });

  it('borra los correos de cuenta cerrados de más de 24 h, nunca los pendientes', async () => {
    const email = { to: { email: 'a@example.test' }, subject: 'x', html: '<p>x</p>', text: 'x' };
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await getDb().transaction((tx) => enqueueAccountEmail(tx, { kind: 'password_changed', customerId: null, to: 'a@example.test', email }))).id);
    }
    await getPool().query(`UPDATE email_outbox SET created_at = now() - interval '2 days'`);
    await getPool().query(`UPDATE email_outbox SET status = 'sent', payload = NULL WHERE id = $1`, [ids[0]]);
    await getPool().query(`UPDATE email_outbox SET status = 'failed', payload = NULL WHERE id = $1`, [ids[1]]);
    const result = await purgeExpired(getDb());
    expect(result.accountEmails).toBe(2);
    expect(await q('SELECT id FROM email_outbox')).toEqual([{ id: ids[2] }]);
  });
});
