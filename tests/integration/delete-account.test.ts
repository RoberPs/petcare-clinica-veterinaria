import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startFakeEmailServer, type FakeEmailServer } from '../../scripts/fake-email-provider';
import { loadContentFile } from '@/content/load';
import { ACCOUNT_MESSAGES } from '@/domain/account-schemas';
import { dispatchPending } from '@/email/dispatch';
import { createFakeProvider } from '@/email/fake';
import { processDeleteAccount } from '@/lib/account/delete-account';
import { processLogin } from '@/lib/account/login';
import { processRegistration } from '@/lib/account/register';
import { processResetRequest } from '@/lib/account/password-reset';
import { peekToken } from '@/lib/auth/tokens';
import { createSubmissionToken } from '@/lib/form-token';
import { createCustomer, createPet, createSessionFor, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Eliminar la cuenta (US7, A12): inmediato, definitivo y en cascada.

let fake: FakeEmailServer;
let ipCounter = 0;
const freshIp = () => `198.51.100.${(ipCounter = (ipCounter + 1) % 250)}`;
const ctx = () => ({ ip: freshIp(), now: new Date() });

const counts = async (customerId: string) =>
  Object.fromEntries(
    await Promise.all(
      ['customers', 'pets', 'customer_sessions', 'account_tokens', 'customer_consents'].map(async (t) => {
        const col = t === 'customers' ? 'id' : 'customer_id';
        const [r] = await q(`SELECT count(*)::int AS n FROM ${t} WHERE ${col} = $1`, [customerId]);
        return [t, r!.n];
      }),
    ),
  );

describe('eliminar la cuenta (US7)', () => {
  beforeAll(async () => {
    const db = await setupTestDb();
    await truncateAll();
    await loadContentFile(db, 'content/petcare.yaml');
    fake = await startFakeEmailServer();
  });
  beforeEach(async () => {
    await resetAccountState();
    fake.emails.length = 0;
  });
  afterAll(async () => {
    await fake.close();
    await teardownTestDb();
  });

  it('con la contraseña incorrecta no cambia nada y cuenta como fallo en login_account', async () => {
    const c = await createCustomer();
    const out = await processDeleteAccount(formData({ current_password: 'no es la mía' }), c, ctx());
    expect(out.result).toMatchObject({ status: 'invalid', fieldErrors: { current_password: ACCOUNT_MESSAGES.current_password_wrong } });
    expect((await counts(c.id)).customers).toBe(1);
    expect(await q("SELECT bucket FROM rate_limit_hits WHERE bucket LIKE 'login_account:%'")).toHaveLength(1);
  });

  it('borra todo en cascada, avisa con account_deleted (customer_id = NULL) e invalida los enlaces previos', async () => {
    const c = await createCustomer();
    await createPet(c.id);
    await createPet(c.id);
    await createSessionFor(c.id);
    await processResetRequest(formData({ email: c.email }), ctx());
    const [mail] = await q("SELECT payload FROM email_outbox WHERE kind = 'password_reset'");
    const resetToken = String(mail!.payload.text).match(/token=([A-Za-z0-9_-]+)/)![1]!;

    const out = await processDeleteAccount(formData({ current_password: c.password }), c, ctx());
    expect(out.result).toEqual({ status: 'ok' });
    expect(await counts(c.id)).toEqual({ customers: 0, pets: 0, customer_sessions: 0, account_tokens: 0, customer_consents: 0 });

    const [deleted] = await q("SELECT customer_id, status::text, payload FROM email_outbox WHERE kind = 'account_deleted'");
    expect(deleted).toMatchObject({ customer_id: null, status: 'pending' });
    await dispatchPending({ provider: createFakeProvider(fake.url, 'PetCare <no-responder@example.test>'), outboxIds: out.outboxIds });
    expect(fake.emails.map((e) => e.body.subject)).toEqual([expect.stringMatching(/^Hemos eliminado tu cuenta/)]);
    expect(await q("SELECT status::text, payload FROM email_outbox WHERE kind = 'account_deleted'")).toEqual([{ status: 'sent', payload: null }]);

    expect(await peekToken(resetToken, 'reset_password')).toEqual({ status: 'invalid' });
    expect((await processLogin(formData({ email: c.email, password: c.password }), ctx())).status).toBe('credentials');
  });

  it('el correo queda libre: registrarse otra vez crea una cuenta limpia', async () => {
    const c = await createCustomer();
    await createPet(c.id, { name: 'Antigua' });
    await processDeleteAccount(formData({ current_password: c.password }), c, ctx());
    const out = await processRegistration(
      formData({
        first_name: 'Nueva',
        last_name: 'Cuenta',
        email: c.email,
        password: 'otra frase muy larga',
        password_confirm: 'otra frase muy larga',
        accept_terms: 'on',
        submission_token: createSubmissionToken(),
      }),
      { ip: freshIp(), now: new Date(Date.now() + 5_000) },
    );
    expect(out.result).toEqual({ status: 'ok' });
    const rows = await q('SELECT id, first_name, email_verified_at FROM customers WHERE email_normalized = $1', [c.email]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(c.id);
    expect(rows[0]!.email_verified_at).toBeNull();
    expect(await q('SELECT id FROM pets')).toEqual([]);
  });
});
