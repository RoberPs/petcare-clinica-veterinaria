import { hash } from '@node-rs/argon2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { processLogin } from '@/lib/account/login';
import { safeReturnTo } from '@/lib/account/login';
import { getPool } from '@/db/client';
import { createCustomer, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Inicio de sesión (US2, A1, A2 y A6).

let ipCounter = 0;
const freshIp = () => `198.51.100.${(ipCounter = (ipCounter + 1) % 250)}`;
const login = (email: string, password: string, extra: Record<string, string> = {}, ip = freshIp(), now = new Date()) =>
  processLogin(formData({ email, password, ...extra }), { ip, now });

describe('inicio de sesión (US2)', () => {
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

  it('sin "Recordarme": sesión de 12 h como máximo y remember = false', async () => {
    const c = await createCustomer();
    const now = new Date();
    const out = await login(c.email, c.password, {}, freshIp(), now);
    expect(out).toMatchObject({ status: 'ok', customerId: c.id, remember: false });
    const [s] = await q('SELECT remember, expires_at FROM customer_sessions WHERE customer_id = $1', [c.id]);
    expect(s!.remember).toBe(false);
    expect(new Date(s!.expires_at).getTime() - now.getTime()).toBe(12 * 60 * 60 * 1000);
  });

  it('con "Recordarme": sesión de 30 días', async () => {
    const c = await createCustomer();
    const now = new Date();
    const out = await login(c.email.toUpperCase(), c.password, { remember: 'on' }, freshIp(), now);
    expect(out).toMatchObject({ status: 'ok', remember: true });
    const [s] = await q('SELECT remember, expires_at FROM customer_sessions');
    expect(s!.remember).toBe(true);
    expect(new Date(s!.expires_at).getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('correo inexistente y contraseña incorrecta dan el mismo resultado', async () => {
    const c = await createCustomer();
    const wrong = await login(c.email, 'no es la contraseña');
    const missing = await login('nadie@example.test', 'no es la contraseña');
    expect(wrong).toEqual({ status: 'credentials', values: { email: c.email } });
    expect(missing).toEqual({ status: 'credentials', values: { email: 'nadie@example.test' } });
    expect(await q('SELECT token_hash FROM customer_sessions')).toEqual([]);
  });

  it('cuenta sin verificar: "unverified" solo con la contraseña correcta, y sin sesión', async () => {
    const c = await createCustomer({ verified: false });
    expect(await login(c.email, c.password)).toEqual({ status: 'unverified', email: c.email });
    expect(await login(c.email, 'no es la contraseña')).toMatchObject({ status: 'credentials' });
    expect(await q('SELECT token_hash FROM customer_sessions')).toEqual([]);
  });

  it('bloqueo login_account: al 6.º intento tras 5 fallos, también con la contraseña correcta', async () => {
    const c = await createCustomer();
    for (let i = 0; i < 5; i++) expect((await login(c.email, `mala ${i}`)).status).toBe('credentials');
    const blocked = await login(c.email, c.password);
    expect(blocked).toMatchObject({ status: 'rate_limited' });
    if (blocked.status === 'rate_limited') expect(blocked.retryMinutes).toBeGreaterThanOrEqual(14);
    expect(await q('SELECT token_hash FROM customer_sessions')).toEqual([]);
  });

  it('el bloqueo por cuenta también se aplica a correos que no existen', async () => {
    for (let i = 0; i < 5; i++) await login('fantasma@example.test', `mala ${i}`);
    expect((await login('fantasma@example.test', 'otra')).status).toBe('rate_limited');
  });

  it('un acceso correcto no apunta intentos', async () => {
    const c = await createCustomer();
    for (let i = 0; i < 6; i++) expect((await login(c.email, c.password)).status).toBe('ok');
    expect(await q('SELECT id FROM rate_limit_hits')).toEqual([]);
  });

  it('bloqueo login_origin: al 21.º intento desde el mismo origen', async () => {
    const ip = '203.0.113.77';
    for (let i = 0; i < 20; i++) expect((await login(`u${i}@example.test`, 'mala', {}, ip)).status).toBe('credentials');
    const c = await createCustomer();
    expect(await login(c.email, c.password, {}, ip)).toMatchObject({ status: 'rate_limited' });
    expect((await login(c.email, c.password)).status).toBe('ok');
  });

  it('rehace el hash si los parámetros guardados son más bajos', async () => {
    const c = await createCustomer();
    const weak = await hash(c.password, { algorithm: 2, memoryCost: 8192, timeCost: 1, parallelism: 1 });
    await getPool().query('UPDATE customers SET password_hash = $1 WHERE id = $2', [weak, c.id]);
    expect((await login(c.email, c.password)).status).toBe('ok');
    const [row] = await q('SELECT password_hash FROM customers WHERE id = $1', [c.id]);
    expect(row!.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect((await login(c.email, c.password)).status).toBe('ok');
  });

  it('formato no válido: error de campo sin consultar la cuenta', async () => {
    const out = await login('no-es-correo', '');
    expect(out).toMatchObject({ status: 'invalid', fieldErrors: { email: expect.any(String), password: expect.any(String) } });
  });

  it('return_to: solo rutas internas', () => {
    expect(safeReturnTo('/mi-cuenta/mascotas')).toBe('/mi-cuenta/mascotas');
    expect(safeReturnTo('//evil.example')).toBe('/mi-cuenta');
    expect(safeReturnTo('https://evil.example')).toBe('/mi-cuenta');
    expect(safeReturnTo('/\\evil')).toBe('/mi-cuenta');
    expect(safeReturnTo(undefined)).toBe('/mi-cuenta');
    expect(safeReturnTo('/iniciar-sesion')).toBe('/mi-cuenta');
  });
});
