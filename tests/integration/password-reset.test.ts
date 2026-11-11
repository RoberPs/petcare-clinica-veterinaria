import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { processLogin } from '@/lib/account/login';
import { processResetPassword, processResetRequest } from '@/lib/account/password-reset';
import { peekToken } from '@/lib/auth/tokens';
import { createCustomer, createSessionFor, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Recuperación de la contraseña (US5, FR-018 a FR-021).

const NEW_PASSWORD = 'tortuga lenta pero segura';
let ipCounter = 0;
const freshIp = () => `198.51.100.${(ipCounter = (ipCounter + 1) % 250)}`;
const later = (ms = 0) => new Date(Date.now() + ms);

const request = (email: string, ip = freshIp(), now = later()) => processResetRequest(formData({ email }), { ip, now });
async function lastResetToken(): Promise<string> {
  const rows = await q("SELECT payload FROM email_outbox WHERE kind = 'password_reset' AND payload IS NOT NULL ORDER BY created_at DESC LIMIT 1");
  return String(rows[0]!.payload.text).match(/token=([A-Za-z0-9_-]+)/)![1]!;
}
const reset = (token: string, password = NEW_PASSWORD, confirm = password, now = later()) =>
  processResetPassword(formData({ token, password, password_confirm: confirm }), { now });

describe('recuperar la contraseña (US5)', () => {
  beforeAll(async () => {
    const db = await setupTestDb();
    await truncateAll();
    await loadContentFile(db, 'content/petcare.yaml');
  });
  beforeEach(async () => {
    await resetAccountState();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('responde igual exista o no el correo, y solo encola si existe', async () => {
    const c = await createCustomer();
    const known = await request(c.email);
    const unknown = await request('nadie@example.test');
    expect(known.result).toEqual({ status: 'ok' });
    expect(unknown).toEqual({ result: { status: 'ok' }, outboxIds: [] });
    expect(known.outboxIds).toHaveLength(1);
    expect(await q("SELECT kind::text, customer_id FROM email_outbox")).toEqual([{ kind: 'password_reset', customer_id: c.id }]);
  });

  it('el token dura 1 hora y un token nuevo invalida el anterior', async () => {
    const c = await createCustomer();
    await request(c.email);
    const first = await lastResetToken();
    expect(await peekToken(first, 'reset_password', later(59 * 60_000))).toMatchObject({ status: 'valid' });
    expect(await peekToken(first, 'reset_password', later(61 * 60_000))).toEqual({ status: 'expired' });
    await request(c.email);
    const second = await lastResetToken();
    expect(await peekToken(first, 'reset_password')).toEqual({ status: 'invalid' });
    expect(await peekToken(second, 'reset_password')).toMatchObject({ status: 'valid' });
  });

  it('cambia el hash, borra todas las sesiones, gasta el token y avisa con password_changed', async () => {
    const c = await createCustomer();
    await createSessionFor(c.id, true);
    await createSessionFor(c.id, false);
    await request(c.email);
    const token = await lastResetToken();

    const out = await reset(token);
    expect(out.result).toEqual({ status: 'ok' });
    expect(out.outboxIds).toHaveLength(1);
    expect(await q('SELECT token_hash FROM customer_sessions')).toEqual([]);
    expect((await processLogin(formData({ email: c.email, password: c.password }), { ip: freshIp(), now: later() })).status).toBe('credentials');
    expect((await processLogin(formData({ email: c.email, password: NEW_PASSWORD }), { ip: freshIp(), now: later() })).status).toBe('ok');
    expect((await q("SELECT kind::text FROM email_outbox ORDER BY created_at")).map((r) => r.kind)).toEqual(['password_reset', 'password_changed']);

    // El enlace usado ya no sirve.
    expect((await reset(token, 'otra frase bastante larga')).result).toEqual({ status: 'expired' });
  });

  it('un token caducado no cambia nada', async () => {
    const c = await createCustomer();
    await request(c.email);
    const token = await lastResetToken();
    expect((await reset(token, NEW_PASSWORD, NEW_PASSWORD, later(61 * 60_000))).result).toEqual({ status: 'expired' });
    expect((await processLogin(formData({ email: c.email, password: c.password }), { ip: freshIp(), now: later() })).status).toBe('ok');
  });

  it('una cuenta sin verificar queda verificada al restablecer (FR-021)', async () => {
    const c = await createCustomer({ verified: false });
    await request(c.email);
    await reset(await lastResetToken());
    const [row] = await q('SELECT email_verified_at FROM customers WHERE id = $1', [c.id]);
    expect(row!.email_verified_at).not.toBeNull();
  });

  it('valida la nueva contraseña sin gastar el token', async () => {
    const c = await createCustomer();
    await request(c.email);
    const token = await lastResetToken();
    expect((await reset(token, 'corta', 'corta')).result).toMatchObject({ status: 'invalid', fieldErrors: { password: 'Usa al menos 10 caracteres.' } });
    expect((await reset(token, NEW_PASSWORD, 'otra distinta')).result).toMatchObject({ status: 'invalid', fieldErrors: { password_confirm: expect.any(String) } });
    expect(await peekToken(token, 'reset_password')).toMatchObject({ status: 'valid' });
  });

  it('limita a 3 correos de recuperación por dirección y hora', async () => {
    const c = await createCustomer();
    for (let i = 0; i < 4; i++) await request(c.email);
    expect((await q("SELECT status::text FROM email_outbox ORDER BY created_at")).map((r) => r.status)).toEqual(['pending', 'pending', 'pending', 'skipped_rate_limit']);
  });

  it('aplica el límite auth_origin por origen', async () => {
    const ip = '203.0.113.90';
    for (let i = 0; i < 10; i++) expect((await request(`x${i}@example.test`, ip)).result.status).toBe('ok');
    expect((await request('x10@example.test', ip)).result).toMatchObject({ status: 'rate_limited' });
  });
});
