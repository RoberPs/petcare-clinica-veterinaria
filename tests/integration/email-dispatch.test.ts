import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startFakeEmailServer, type FakeEmailServer } from '../../scripts/fake-email-provider';
import { getPool } from '@/db/client';
import { loadContentFile } from '@/content/load';
import { backoffMs, dispatchPending, MAX_ATTEMPTS } from '@/email/dispatch';
import { createFakeProvider } from '@/email/fake';
import { createSubmissionToken } from '@/lib/form-token';
import { processContactSubmission } from '@/lib/contact-submission';
import { setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

let fake: FakeEmailServer;
const q = async (sql: string, params: unknown[] = []) => (await getPool().query(sql, params)).rows;

async function submit(email = 'ana@example.test') {
  const f = new FormData();
  const values = { nombre: 'Ana', email, motivo: 'otro', mensaje: 'Texto secreto del visitante.', privacidad: 'on', submission_token: createSubmissionToken() };
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  const out = await processContactSubmission(f, { ip: `198.51.100.${Math.floor(Math.random() * 200)}`, now: new Date(Date.now() + 5000) });
  return out.newMessageId!;
}

describe('envío de la bandeja de salida', () => {
  beforeAll(async () => {
    await setupTestDb();
    fake = await startFakeEmailServer();
  });
  beforeEach(async () => {
    await truncateAll();
    await loadContentFile(await setupTestDb(), 'content/petcare.yaml');
    fake.emails.length = 0;
    fake.setFailures(0);
  });
  afterAll(async () => {
    await fake.close();
    await teardownTestDb();
  });

  const provider = () => createFakeProvider(fake.url, 'PetCare <no-responder@example.test>');

  it('un 201 deja los dos correos en sent; el acuse no lleva el mensaje', async () => {
    await submit();
    const { processed } = await dispatchPending({ provider: provider() });
    expect(processed).toBe(2);
    const rows = await q('SELECT kind, status, attempts, provider_message_id, sent_at FROM email_outbox ORDER BY kind');
    expect(rows.every((r) => r.status === 'sent' && r.attempts === 1 && r.provider_message_id && r.sent_at)).toBe(true);
    expect(fake.emails).toHaveLength(2);
    const toClinic = fake.emails.find((e) => (e.body.to as { email: string }[])[0]!.email === process.env.CLINIC_INBOX_EMAIL)!;
    expect(String(toClinic.body.textContent)).toContain('Texto secreto del visitante.');
    expect(toClinic.body.replyTo).toMatchObject({ email: 'ana@example.test' });
    const ack = fake.emails.find((e) => (e.body.to as { email: string }[])[0]!.email === 'ana@example.test')!;
    expect(String(ack.body.textContent)).not.toContain('Texto secreto');
    expect(String(ack.body.htmlContent)).not.toContain('Texto secreto');
  });

  it('un 5xx incrementa attempts y aplica la espera', async () => {
    await submit();
    fake.setFailures(10, 503);
    const before = Date.now();
    await dispatchPending({ provider: provider() });
    const rows = await q('SELECT status, attempts, last_error_code, next_attempt_at FROM email_outbox');
    for (const r of rows) {
      expect(r).toMatchObject({ status: 'pending', attempts: 1, last_error_code: '503' });
      expect(r.next_attempt_at.getTime()).toBeGreaterThanOrEqual(before + backoffMs(1) - 1000);
    }
    // Antes de que llegue su turno no se reintenta.
    expect((await dispatchPending({ provider: provider() })).processed).toBe(0);
  });

  it('con 8 fallos queda failed', async () => {
    await submit();
    fake.setFailures(1000, 500);
    let clock = Date.now();
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      await dispatchPending({ provider: provider(), now: () => new Date(clock) });
      clock += 7 * 3600_000;
    }
    const rows = await q('SELECT status, attempts FROM email_outbox');
    expect(rows).toEqual([
      { status: 'failed', attempts: MAX_ATTEMPTS },
      { status: 'failed', attempts: MAX_ATTEMPTS },
    ]);
  });

  it('un 401 da failed inmediato', async () => {
    await submit();
    fake.setFailures(10, 401);
    await dispatchPending({ provider: provider() });
    const rows = await q('SELECT status, attempts, last_error_code FROM email_outbox');
    expect(rows.every((r) => r.status === 'failed' && r.attempts === 1 && r.last_error_code === '401')).toBe(true);
  });

  it('el reintento llega a sent en el cuarto intento', async () => {
    const id = await submit();
    await getPool().query("UPDATE email_outbox SET status = 'sent' WHERE kind = 'visitor_ack' AND contact_message_id = $1", [id]);
    fake.setFailures(3, 500);
    let clock = Date.now();
    for (let i = 0; i < 4; i++) {
      await dispatchPending({ provider: provider(), now: () => new Date(clock) });
      clock += 2 * 3600_000;
    }
    expect(await q("SELECT status, attempts FROM email_outbox WHERE kind = 'clinic_notification'")).toEqual([{ status: 'sent', attempts: 4 }]);
  });

  it('si falla el acuse, el correo a la clínica no se ve afectado', async () => {
    await submit();
    // El primer envío (clinic_notification, más antiguo) va bien; luego el proveedor rechaza.
    await getPool().query("UPDATE email_outbox SET next_attempt_at = next_attempt_at - interval '1 second' WHERE kind = 'clinic_notification'");
    let calls = 0;
    const flaky = provider();
    await dispatchPending({
      provider: { send: async (m) => (++calls === 1 ? flaky.send(m) : { ok: false, retryable: false, code: '400' }) },
    });
    const rows = await q('SELECT kind, status FROM email_outbox ORDER BY kind');
    expect(rows).toEqual([
      { kind: 'clinic_notification', status: 'sent' },
      { kind: 'visitor_ack', status: 'failed' },
    ]);
    expect(await q('SELECT count(*)::int AS n FROM contact_messages')).toEqual([{ n: 1 }]);
  });
});
