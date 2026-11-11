import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/db/client';
import { loadContentFile } from '@/content/load';
import { purgeExpired } from '@/db/retention';
import { createSubmissionToken } from '@/lib/form-token';
import { processContactSubmission } from '@/lib/contact-submission';
import { setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

const q = async (sql: string) => (await getPool().query(sql)).rows;

async function submit(email: string) {
  const f = new FormData();
  const values = { nombre: 'Ana', email, motivo: 'otro', mensaje: 'Un mensaje de prueba.', privacidad: 'on', submission_token: createSubmissionToken() };
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return (await processContactSubmission(f, { ip: '192.0.2.1', now: new Date(Date.now() + 5000) })).newMessageId!;
}

describe('purga por conservación', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await loadContentFile(await setupTestDb(), 'content/petcare.yaml');
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('borra los mensajes caducados con su bandeja de salida y los registros del límite de más de 24 h', async () => {
    const old = await submit('vieja@example.test');
    await submit('nueva@example.test');
    await getPool().query("UPDATE contact_messages SET purge_after = now() - interval '1 day' WHERE id = $1", [old]);
    await getPool().query("UPDATE rate_limit_hits SET hit_at = now() - interval '25 hours' WHERE ctid IN (SELECT ctid FROM rate_limit_hits LIMIT 1)");

    const result = await purgeExpired(await setupTestDb());
    expect(result).toEqual({ messages: 1, hits: 1 });
    expect(await q('SELECT email FROM contact_messages')).toEqual([{ email: 'nueva@example.test' }]);
    expect(await q('SELECT count(*)::int AS n FROM email_outbox')).toEqual([{ n: 2 }]);
    expect(await q('SELECT count(*)::int AS n FROM rate_limit_hits')).toEqual([{ n: 1 }]);
  });
});
