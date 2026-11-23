import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { processRegistration } from '@/lib/account/register';
import { createSubmissionToken } from '@/lib/form-token';
import { verifyPassword } from '@/lib/auth/password';
import { ACCOUNT_MESSAGES } from '@/domain/account-schemas';
import { createCustomer, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Registro (US1, A5): alta nueva, correo duplicado sin revelar si existe, idempotencia y límites.

const later = () => new Date(Date.now() + 5_000); // el token del formulario exige 3 s (R6)
let ipCounter = 0;
const freshIp = () => `198.51.100.${(ipCounter = (ipCounter + 1) % 250)}`;

function registerForm(overrides: Record<string, string | undefined> = {}) {
  return formData({
    first_name: 'Ana',
    last_name: 'Prueba',
    email: 'ana@example.test',
    phone: '',
    password: 'caballo bateria grapa',
    password_confirm: 'caballo bateria grapa',
    accept_terms: 'on',
    submission_token: createSubmissionToken(),
    ...overrides,
  });
}

const outbox = (kind?: string) =>
  q(`SELECT kind, status, customer_id, payload FROM email_outbox ${kind ? 'WHERE kind = $1' : ''} ORDER BY created_at`, kind ? [kind] : []);

describe('registro (US1)', () => {
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

  it('alta nueva: cliente sin verificar, consentimiento con las versiones, token y verify_email', async () => {
    const out = await processRegistration(registerForm(), { ip: freshIp(), now: later() });
    expect(out.result).toEqual({ status: 'ok' });
    expect(out.outboxIds).toHaveLength(1);

    const [customer] = await q('SELECT * FROM customers');
    expect(customer).toMatchObject({ email: 'ana@example.test', email_normalized: 'ana@example.test', first_name: 'Ana', email_verified_at: null, marketing_opt_in: false });
    expect(customer!.password_hash).toMatch(/^\$argon2id\$/);
    expect((await verifyPassword(customer!.password_hash, 'caballo bateria grapa')).ok).toBe(true);

    const consents = await q('SELECT kind, privacy_version, terms_version FROM customer_consents');
    const versions = await q("SELECT kind, version FROM legal_pages WHERE kind IN ('privacidad', 'terminos')");
    const v = Object.fromEntries(versions.map((r) => [r.kind, r.version]));
    expect(consents).toEqual([{ kind: 'privacy_terms', privacy_version: v.privacidad, terms_version: v.terminos }]);

    expect(await q("SELECT purpose FROM account_tokens")).toEqual([{ purpose: 'verify_email' }]);
    const [mail] = await outbox();
    expect(mail).toMatchObject({ kind: 'verify_email', status: 'pending', customer_id: customer!.id });
    expect(mail!.payload.to.email).toBe('ana@example.test');
    expect(mail!.payload.text).toMatch(/\/verificar-correo\?token=[A-Za-z0-9_-]+/);
  });

  it('guarda la preferencia de consejos y su consentimiento si la casilla viene marcada', async () => {
    await processRegistration(registerForm({ marketing_opt_in: 'on' }), { ip: freshIp(), now: later() });
    const [c] = await q('SELECT marketing_opt_in, marketing_opt_in_changed_at FROM customers');
    expect(c!.marketing_opt_in).toBe(true);
    expect(c!.marketing_opt_in_changed_at).not.toBeNull();
    expect((await q('SELECT kind::text FROM customer_consents')).map((r) => r.kind).sort()).toEqual(['marketing_opt_in', 'privacy_terms']);
  });

  it('correo ya verificado: misma respuesta, sin segunda fila y con account_exists', async () => {
    const existing = await createCustomer({ email: 'ana@example.test', verified: true });
    const out = await processRegistration(registerForm({ password: 'otra frase distinta', password_confirm: 'otra frase distinta' }), { ip: freshIp(), now: later() });
    expect(out.result).toEqual({ status: 'ok' });
    expect(await q('SELECT id FROM customers')).toEqual([{ id: existing.id }]);
    expect((await outbox()).map((m) => m.kind)).toEqual(['account_exists']);
    // La contraseña de la cuenta verificada no cambia.
    const [c] = await q('SELECT password_hash FROM customers');
    expect((await verifyPassword(c!.password_hash, existing.password)).ok).toBe(true);
  });

  it('correo sin verificar: token nuevo (el anterior deja de valer) y verify_email', async () => {
    await processRegistration(registerForm(), { ip: freshIp(), now: later() });
    const [first] = await q('SELECT token_hash FROM account_tokens');
    const out = await processRegistration(registerForm(), { ip: freshIp(), now: later() });
    expect(out.result).toEqual({ status: 'ok' });
    expect(await q('SELECT count(*)::int AS n FROM customers')).toEqual([{ n: 1 }]);
    const tokens = await q('SELECT token_hash FROM account_tokens');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.token_hash).not.toBe(first!.token_hash);
    expect((await outbox()).map((m) => m.kind)).toEqual(['verify_email', 'verify_email']);
  });

  it('ignora mayúsculas y espacios del correo', async () => {
    await processRegistration(registerForm({ email: 'Ana@Example.test' }), { ip: freshIp(), now: later() });
    await processRegistration(registerForm({ email: '  ANA@example.TEST ' }), { ip: freshIp(), now: later() });
    // Una sola cuenta; al no estar verificada, gana el último registro (se guarda sin los espacios).
    expect(await q('SELECT email, email_normalized FROM customers')).toEqual([{ email: 'ANA@example.TEST', email_normalized: 'ana@example.test' }]);
  });

  it('un doble envío con el mismo submission_id no repite nada', async () => {
    const token = createSubmissionToken();
    const a = await processRegistration(registerForm({ submission_token: token }), { ip: freshIp(), now: later() });
    const b = await processRegistration(registerForm({ submission_token: token }), { ip: freshIp(), now: later() });
    expect(a.result).toEqual({ status: 'ok' });
    expect(b.result).toEqual({ status: 'ok' });
    expect(b.outboxIds).toEqual([]);
    expect(await q('SELECT count(*)::int AS n FROM customers')).toEqual([{ n: 1 }]);
    expect(await outbox()).toHaveLength(1);
  });

  it('contraseñas distintas: error junto al campo, datos conservados y nada guardado', async () => {
    const out = await processRegistration(registerForm({ password_confirm: 'otra cosa distinta' }), { ip: freshIp(), now: later() });
    expect(out.result).toMatchObject({ status: 'invalid', fieldErrors: { password_confirm: ACCOUNT_MESSAGES.password_confirm } });
    if (out.result.status !== 'invalid') return;
    expect(out.result.values.first_name).toBe('Ana');
    expect(out.result.values.password).toBeUndefined();
    expect(await q('SELECT id FROM customers')).toEqual([]);
  });

  it('sin aceptar la privacidad y los términos no se crea la cuenta', async () => {
    const out = await processRegistration(registerForm({ accept_terms: undefined }), { ip: freshIp(), now: later() });
    expect(out.result).toMatchObject({ status: 'invalid', fieldErrors: { accept_terms: ACCOUNT_MESSAGES.accept_terms } });
    expect(await q('SELECT id FROM customers')).toEqual([]);
  });

  it('el campo trampa y el envío demasiado rápido dan un éxito aparente sin guardar nada', async () => {
    expect((await processRegistration(registerForm({ web: 'http://spam' }), { ip: freshIp(), now: later() })).result).toEqual({ status: 'ok' });
    expect((await processRegistration(registerForm(), { ip: freshIp(), now: new Date() })).result).toEqual({ status: 'ok' });
    expect(await q('SELECT id FROM customers')).toEqual([]);
  });

  it('un token de formulario manipulado da "expired"', async () => {
    const out = await processRegistration(registerForm({ submission_token: 'x.y' }), { ip: freshIp(), now: later() });
    expect(out.result).toEqual({ status: 'expired' });
  });

  it('límite auth_origin: 10 intentos cada 10 minutos por origen', async () => {
    const ip = '203.0.113.50';
    for (let i = 0; i < 10; i++) {
      const out = await processRegistration(registerForm({ email: `p${i}@example.test` }), { ip, now: later() });
      expect(out.result.status).toBe('ok');
    }
    const blocked = await processRegistration(registerForm({ email: 'p10@example.test' }), { ip, now: later() });
    expect(blocked.result).toMatchObject({ status: 'rate_limited' });
    if (blocked.result.status === 'rate_limited') expect(blocked.result.retryMinutes).toBeGreaterThanOrEqual(1);
    expect(await q("SELECT id FROM customers WHERE email = 'p10@example.test'")).toEqual([]);
    // Otro origen sigue pudiendo registrarse.
    expect((await processRegistration(registerForm({ email: 'otro@example.test' }), { ip: freshIp(), now: later() })).result.status).toBe('ok');
  });

  it('el 4.º correo de verificación a la misma dirección en una hora queda skipped_rate_limit', async () => {
    for (let i = 0; i < 4; i++) await processRegistration(registerForm(), { ip: freshIp(), now: later() });
    expect((await outbox('verify_email')).map((m) => m.status)).toEqual(['pending', 'pending', 'pending', 'skipped_rate_limit']);
  });
});
