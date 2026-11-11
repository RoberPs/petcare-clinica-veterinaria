import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/db/client';
import { loadContentFile } from '@/content/load';
import { createSubmissionToken } from '@/lib/form-token';
import { processContactSubmission } from '@/lib/contact-submission';
import { setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

const later = () => new Date(Date.now() + 5_000); // el token tiene más de 3 s

function form(overrides: Record<string, string> = {}, token = createSubmissionToken()): FormData {
  const f = new FormData();
  const values: Record<string, string> = {
    nombre: 'Ana Prueba',
    telefono: '',
    email: 'ana@example.test',
    motivo: 'consulta-cita',
    mensaje: 'Quería cambiar la hora de la revisión.',
    privacidad: 'on',
    web: '',
    submission_token: token,
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const q = async (sql: string, params: unknown[] = []) => (await getPool().query(sql, params)).rows;

describe('envío del formulario de contacto', () => {
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

  it('un envío válido crea el mensaje, sus 2 correos y el registro del límite', async () => {
    const out = await processContactSubmission(form(), { ip: '203.0.113.10', now: later() });
    expect(out.result.status).toBe('ok');
    expect(out.newMessageId).toBeDefined();
    const [msg] = await q('SELECT *, age(purge_after, created_at) AS keep FROM contact_messages');
    expect(msg).toMatchObject({ name: 'Ana Prueba', phone: null, email: 'ana@example.test', reason_label: 'Consulta sobre una cita', privacy_version: '2026-11-10' });
    expect(msg.privacy_accepted_at).toBeInstanceOf(Date);
    expect(msg.keep).toMatchObject({ years: 1 });
    const outbox = await q('SELECT kind, status, attempts FROM email_outbox ORDER BY kind');
    expect(outbox).toEqual([
      { kind: 'clinic_notification', status: 'pending', attempts: 0 },
      { kind: 'visitor_ack', status: 'pending', attempts: 0 },
    ]);
    expect(await q('SELECT count(*)::int AS n FROM rate_limit_hits')).toEqual([{ n: 1 }]);
    const [hit] = await q('SELECT bucket FROM rate_limit_hits');
    expect(hit.bucket).not.toContain('203.0.113.10');
  });

  it('el mismo submission_id no crea nada nuevo y devuelve ok', async () => {
    const token = createSubmissionToken();
    await processContactSubmission(form({}, token), { ip: '203.0.113.11', now: later() });
    const again = await processContactSubmission(form({}, token), { ip: '203.0.113.11', now: later() });
    expect(again.result.status).toBe('ok');
    expect(again.newMessageId).toBeUndefined();
    expect(await q('SELECT count(*)::int AS n FROM contact_messages')).toEqual([{ n: 1 }]);
    expect(await q('SELECT count(*)::int AS n FROM email_outbox')).toEqual([{ n: 2 }]);
  });

  it('un segundo mensaje del mismo correo en menos de una hora deja el acuse en skipped_rate_limit', async () => {
    await processContactSubmission(form(), { ip: '203.0.113.12', now: later() });
    await processContactSubmission(form({ email: 'ANA@EXAMPLE.TEST' }), { ip: '203.0.113.12', now: later() });
    const acks = await q("SELECT status FROM email_outbox WHERE kind = 'visitor_ack' ORDER BY created_at");
    expect(acks.map((a) => a.status)).toEqual(['pending', 'skipped_rate_limit']);
    const clinic = await q("SELECT status FROM email_outbox WHERE kind = 'clinic_notification'");
    expect(clinic.map((a) => a.status)).toEqual(['pending', 'pending']);
  });

  it('con 5 envíos por IP en 10 minutos el sexto da rate_limited (también en el mismo /64)', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await processContactSubmission(form({ email: `p${i}@example.test` }), { ip: `2001:db8:1:2::${i + 1}`, now: later() });
      expect(r.result.status).toBe('ok');
    }
    const sixth = await processContactSubmission(form({ email: 'p6@example.test' }), { ip: '2001:db8:1:2:ffff::9', now: later() });
    expect(sixth.result).toEqual({ status: 'rate_limited', phone: process.env.CLINIC_PHONE_DISPLAY });
    const otherNetwork = await processContactSubmission(form({ email: 'p7@example.test' }), { ip: '2001:db8:1:3::1', now: later() });
    expect(otherNetwork.result.status).toBe('ok');
  });

  it('el campo trampa o un envío en menos de 3 s no persisten nada', async () => {
    const trap = await processContactSubmission(form({ web: 'https://spam.example' }), { ip: '203.0.113.13', now: later() });
    expect(trap.result.status).toBe('ok');
    const fast = await processContactSubmission(form(), { ip: '203.0.113.13', now: new Date() });
    expect(fast.result.status).toBe('ok');
    expect(await q('SELECT count(*)::int AS n FROM contact_messages')).toEqual([{ n: 0 }]);
    expect(await q('SELECT count(*)::int AS n FROM rate_limit_hits')).toEqual([{ n: 0 }]);
  });

  it('un token manipulado o caducado da expired; datos inválidos dan invalid sin persistir', async () => {
    const forged = await processContactSubmission(form({}, 'abc.def'), { ip: '203.0.113.14', now: later() });
    expect(forged.result).toEqual({ status: 'expired' });
    const old = await processContactSubmission(form(), { ip: '203.0.113.14', now: new Date(Date.now() + 25 * 3600_000) });
    expect(old.result).toEqual({ status: 'expired' });
    const invalid = await processContactSubmission(form({ email: 'mal', motivo: 'no-existe' }), { ip: '203.0.113.14', now: later() });
    expect(invalid.result).toMatchObject({ status: 'invalid', fieldErrors: { email: expect.any(String), motivo: 'Elige un motivo.' } });
    expect(await q('SELECT count(*)::int AS n FROM contact_messages')).toEqual([{ n: 0 }]);
  });
});
