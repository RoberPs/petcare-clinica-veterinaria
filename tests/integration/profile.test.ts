import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { ACCOUNT_MESSAGES } from '@/domain/account-schemas';
import { processLogin } from '@/lib/account/login';
import { processChangePassword, processUpdateProfile } from '@/lib/account/profile';
import { hashToken } from '@/lib/auth/session';
import { createCustomer, createSessionFor, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Datos personales y cambio de contraseña (US6, FR-027 a FR-030).

const NEW_PASSWORD = 'tortuga lenta pero segura';
let ipCounter = 0;
const freshIp = () => `198.51.100.${(ipCounter = (ipCounter + 1) % 250)}`;
const ctx = () => ({ ip: freshIp(), now: new Date() });

const profileForm = (values: Record<string, string | undefined> = {}) =>
  formData({
    first_name: 'Lucía',
    last_name: 'Prueba Nueva',
    phone: '600 123 456',
    address_line: 'Calle Mayor 1',
    postal_code: '28001',
    city: 'Madrid',
    province: 'Madrid',
    ...values,
  });

describe('datos personales (US6)', () => {
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

  it('guarda nombre, apellidos, teléfono y dirección', async () => {
    const c = await createCustomer();
    expect(await processUpdateProfile(profileForm(), c.id)).toEqual({ status: 'ok' });
    const [row] = await q('SELECT first_name, last_name, phone, address_line, postal_code, city, province FROM customers WHERE id = $1', [c.id]);
    expect(row).toEqual({ first_name: 'Lucía', last_name: 'Prueba Nueva', phone: '600 123 456', address_line: 'Calle Mayor 1', postal_code: '28001', city: 'Madrid', province: 'Madrid' });
  });

  it('vaciar los campos opcionales los deja a NULL', async () => {
    const c = await createCustomer({ phone: '600123456' });
    await processUpdateProfile(profileForm({ phone: '', address_line: '', postal_code: '', city: '', province: '' }), c.id);
    const [row] = await q('SELECT phone, address_line, postal_code, city, province FROM customers WHERE id = $1', [c.id]);
    expect(row).toEqual({ phone: null, address_line: null, postal_code: null, city: null, province: null });
  });

  it('un teléfono o un código postal no válidos no cambian nada (tampoco los demás campos)', async () => {
    const c = await createCustomer({ firstName: 'Original' });
    const bad = await processUpdateProfile(profileForm({ phone: '12', postal_code: '2800' }), c.id);
    expect(bad).toMatchObject({ status: 'invalid', fieldErrors: { phone: ACCOUNT_MESSAGES.phone, postal_code: ACCOUNT_MESSAGES.postal_code } });
    expect(await q('SELECT first_name, phone FROM customers WHERE id = $1', [c.id])).toEqual([{ first_name: 'Original', phone: null }]);
  });

  it('código postal y localidad van juntos', async () => {
    const c = await createCustomer();
    expect(await processUpdateProfile(profileForm({ city: '' }), c.id)).toMatchObject({ status: 'invalid', fieldErrors: { city: expect.any(String) } });
  });

  it('el correo no cambia aunque se envíe en el formulario', async () => {
    const c = await createCustomer();
    await processUpdateProfile(profileForm({ email: 'otro@example.test' }), c.id);
    expect(await q('SELECT email FROM customers WHERE id = $1', [c.id])).toEqual([{ email: c.email }]);
  });

  describe('cambiar la contraseña', () => {
    it('con la actual correcta: cambia el hash, cierra las demás sesiones, conserva la actual y avisa', async () => {
      const c = await createCustomer();
      const current = await createSessionFor(c.id);
      await createSessionFor(c.id, true);
      const out = await processChangePassword(
        formData({ current_password: c.password, password: NEW_PASSWORD, password_confirm: NEW_PASSWORD }),
        { id: c.id, email: c.email, firstName: c.firstName, sessionHash: hashToken(current) },
        ctx(),
      );
      expect(out.result).toEqual({ status: 'ok' });
      expect(out.outboxIds).toHaveLength(1);
      expect(await q('SELECT token_hash FROM customer_sessions WHERE customer_id = $1', [c.id])).toEqual([{ token_hash: hashToken(current) }]);
      expect(await q("SELECT kind::text FROM email_outbox")).toEqual([{ kind: 'password_changed' }]);
      expect((await processLogin(formData({ email: c.email, password: NEW_PASSWORD }), ctx())).status).toBe('ok');
    });

    it('con la actual incorrecta: error junto al campo, sin cambios y un fallo en login_account', async () => {
      const c = await createCustomer();
      const current = await createSessionFor(c.id);
      const out = await processChangePassword(
        formData({ current_password: 'no es la mía', password: NEW_PASSWORD, password_confirm: NEW_PASSWORD }),
        { id: c.id, email: c.email, firstName: c.firstName, sessionHash: hashToken(current) },
        ctx(),
      );
      expect(out.result).toMatchObject({ status: 'invalid', fieldErrors: { current_password: ACCOUNT_MESSAGES.current_password_wrong } });
      expect(await q("SELECT bucket FROM rate_limit_hits WHERE bucket LIKE 'login_account:%'")).toHaveLength(1);
      expect((await processLogin(formData({ email: c.email, password: c.password }), ctx())).status).toBe('ok');
      expect(await q('SELECT id FROM email_outbox')).toEqual([]);
    });

    it('aplica la política a la nueva contraseña', async () => {
      const c = await createCustomer();
      const out = await processChangePassword(
        formData({ current_password: c.password, password: 'corta', password_confirm: 'corta' }),
        { id: c.id, email: c.email, firstName: c.firstName, sessionHash: 'x' },
        ctx(),
      );
      expect(out.result).toMatchObject({ status: 'invalid', fieldErrors: { password: 'Usa al menos 10 caracteres.' } });
    });
  });
});
