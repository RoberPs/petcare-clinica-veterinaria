import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { processRegistration } from '@/lib/account/register';
import { processResendVerification, processVerification } from '@/lib/account/verify';
import { peekToken } from '@/lib/auth/tokens';
import { createSubmissionToken } from '@/lib/form-token';
import { createCustomer, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Verificación del correo (US1, A4): el GET solo mira el token; el POST lo gasta.

const later = (ms = 5_000) => new Date(Date.now() + ms);
let ipCounter = 0;
const freshIp = () => `198.51.100.${(ipCounter = (ipCounter + 1) % 250)}`;

async function register(email = 'ana@example.test') {
  await processRegistration(
    formData({
      first_name: 'Ana',
      last_name: 'Prueba',
      email,
      password: 'caballo bateria grapa',
      password_confirm: 'caballo bateria grapa',
      accept_terms: 'on',
      submission_token: createSubmissionToken(),
    }),
    { ip: freshIp(), now: later() },
  );
}

/** Token en claro del último correo de verificación encolado. */
async function lastToken(): Promise<string> {
  const rows = await q("SELECT payload FROM email_outbox WHERE kind = 'verify_email' AND payload IS NOT NULL ORDER BY created_at DESC LIMIT 1");
  return String(rows[0]!.payload.text).match(/token=([A-Za-z0-9_-]+)/)![1]!;
}

const verifiedAt = async () => (await q('SELECT email_verified_at FROM customers'))[0]!.email_verified_at;

describe('verificación del correo (US1)', () => {
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

  it('un token vigente verifica la cuenta y devuelve el correo para rellenar el inicio de sesión', async () => {
    await register();
    const token = await lastToken();
    const out = await processVerification(formData({ token }), { now: later() });
    expect(out).toEqual({ status: 'ok', email: 'ana@example.test' });
    expect(await verifiedAt()).not.toBeNull();
    expect(await q('SELECT used_at IS NOT NULL AS used FROM account_tokens')).toEqual([{ used: true }]);
  });

  it('el GET (peekToken) no gasta el token', async () => {
    await register();
    const token = await lastToken();
    expect(await peekToken(token, 'verify_email')).toMatchObject({ status: 'valid', email: 'ana@example.test' });
    expect(await peekToken(token, 'verify_email')).toMatchObject({ status: 'valid' });
    expect(await verifiedAt()).toBeNull();
    expect((await processVerification(formData({ token }), { now: later() })).status).toBe('ok');
  });

  it('un token usado indica que la cuenta ya está verificada', async () => {
    await register();
    const token = await lastToken();
    await processVerification(formData({ token }), { now: later() });
    expect(await peekToken(token, 'verify_email')).toMatchObject({ status: 'used', emailVerified: true });
    expect(await processVerification(formData({ token }), { now: later() })).toEqual({ status: 'already_verified' });
  });

  it('un token caducado (más de 24 h) no sirve', async () => {
    await register();
    const token = await lastToken();
    const dayAfter = later(24 * 60 * 60 * 1000 + 10_000);
    expect(await peekToken(token, 'verify_email', dayAfter)).toEqual({ status: 'expired' });
    expect(await processVerification(formData({ token }), { now: dayAfter })).toEqual({ status: 'expired' });
    expect(await verifiedAt()).toBeNull();
  });

  it('un token manipulado o de otro propósito no sirve', async () => {
    await register();
    const token = await lastToken();
    const tampered = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(await peekToken(tampered, 'verify_email')).toEqual({ status: 'invalid' });
    expect(await peekToken(token, 'reset_password')).toEqual({ status: 'invalid' });
    expect(await peekToken('<script>', 'verify_email')).toEqual({ status: 'invalid' });
    expect(await processVerification(formData({ token: tampered }), { now: later() })).toEqual({ status: 'expired' });
    expect(await processVerification(formData({}), { now: later() })).toEqual({ status: 'expired' });
  });

  it('el reenvío emite un token nuevo e invalida el anterior', async () => {
    await register();
    const old = await lastToken();
    const out = await processResendVerification(formData({ email: 'ANA@example.test ' }), { ip: freshIp(), now: later() });
    expect(out.result).toEqual({ status: 'ok' });
    expect(out.outboxIds).toHaveLength(1);
    const fresh = await lastToken();
    expect(fresh).not.toBe(old);
    expect(await peekToken(old, 'verify_email')).toEqual({ status: 'invalid' });
    expect(await peekToken(fresh, 'verify_email')).toMatchObject({ status: 'valid' });
  });

  it('el reenvío responde igual si la cuenta no existe o ya está verificada, sin encolar nada', async () => {
    await createCustomer({ email: 'verificada@example.test', verified: true });
    const a = await processResendVerification(formData({ email: 'nadie@example.test' }), { ip: freshIp(), now: later() });
    const b = await processResendVerification(formData({ email: 'verificada@example.test' }), { ip: freshIp(), now: later() });
    expect(a).toEqual({ result: { status: 'ok' }, outboxIds: [] });
    expect(b).toEqual({ result: { status: 'ok' }, outboxIds: [] });
    expect(await q('SELECT id FROM email_outbox')).toEqual([]);
  });

  it('el reenvío con un correo mal escrito da un error de campo', async () => {
    const out = await processResendVerification(formData({ email: 'no-es-correo' }), { ip: freshIp(), now: later() });
    expect(out.result).toMatchObject({ status: 'invalid', fieldErrors: { email: expect.any(String) } });
  });
});
