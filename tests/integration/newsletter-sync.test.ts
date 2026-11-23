import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { getDb } from '@/db/client';
import { processDeleteAccount } from '@/lib/account/delete-account';
import { processUpdateMarketing } from '@/lib/account/profile';
import { processRegistration } from '@/lib/account/register';
import { processVerification } from '@/lib/account/verify';
import { issueToken } from '@/lib/auth/tokens';
import { createSubmissionToken } from '@/lib/form-token';
import { confirmSubscription } from '@/lib/newsletter/confirm';
import { emailHmac } from '@/lib/newsletter/hash';
import { subscribe } from '@/lib/newsletter/subscribe';
import { moveSubscriptionEmail } from '@/lib/newsletter/sync';
import { unsubscribeToken } from '@/lib/newsletter/tokens';
import { unsubscribeWithToken } from '@/lib/newsletter/unsubscribe';
import { createCustomer, DEFAULT_PASSWORD, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { confirmEmails, confirmTokenFrom, createSubscription, freshIp, lastConfirmEmail, later, subscribeForm, subscriptions, unsubscribeRecords } from './helpers/newsletter';

// Sincronización de la lista con la preferencia "consejos y novedades" (E11, US5).

const customerRow = async (id: string) =>
  (await q('SELECT marketing_opt_in, marketing_opt_in_changed_at FROM customers WHERE id = $1', [id]))[0]!;
const consents = async (id: string) =>
  (await q(`SELECT kind FROM customer_consents WHERE customer_id = $1 AND kind <> 'privacy_terms' ORDER BY created_at`, [id])).map((r) => r.kind);

async function verify(customerId: string) {
  const token = await issueToken(getDb(), customerId, 'verify_email');
  return processVerification(formData({ token }), { now: later() });
}

describe('boletín y cuentas (US5)', () => {
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

  it('verificar una cuenta con la preferencia: suscrita y confirmada, sin correo de confirmación', async () => {
    const c = await createCustomer({ email: 'ana@example.test', verified: false, marketingOptIn: true });
    expect(await subscriptions()).toHaveLength(0);
    expect((await verify(c.id)).status).toBe('ok');
    expect(await subscriptions()).toMatchObject([{ email: 'ana@example.test', status: 'confirmed', source: 'account', customer_id: c.id }]);
    expect(await confirmEmails()).toHaveLength(0);
  });

  it('verificar sin la preferencia: no se suscribe', async () => {
    const c = await createCustomer({ verified: false, marketingOptIn: false });
    await verify(c.id);
    expect(await subscriptions()).toHaveLength(0);
  });

  it('registro con la casilla y sin verificar: nada en la lista', async () => {
    const out = await processRegistration(
      formData({
        first_name: 'Ana',
        last_name: 'Prueba',
        email: 'ana@example.test',
        phone: '',
        password: 'caballo bateria grapa',
        password_confirm: 'caballo bateria grapa',
        accept_terms: 'on',
        marketing_opt_in: 'on',
        submission_token: createSubmissionToken(),
      }),
      { ip: freshIp(), now: later() },
    );
    expect(out.result).toEqual({ status: 'ok' });
    expect(await subscriptions()).toHaveLength(0);
  });

  it('activar y desactivar en "Datos personales": lista, consentimientos y fecha', async () => {
    const c = await createCustomer({ email: 'ana@example.test' });
    expect(await processUpdateMarketing(formData({ marketing_opt_in: 'on' }), c.id)).toEqual({ status: 'ok' });
    expect(await subscriptions()).toMatchObject([{ status: 'confirmed', customer_id: c.id }]);
    expect((await customerRow(c.id)).marketing_opt_in).toBe(true);
    expect((await customerRow(c.id)).marketing_opt_in_changed_at).not.toBeNull();

    expect(await processUpdateMarketing(formData({}), c.id)).toEqual({ status: 'ok' });
    expect(await subscriptions()).toHaveLength(0);
    expect(await unsubscribeRecords()).toMatchObject([{ reason: 'account', email_hmac: emailHmac('ana@example.test') }]);
    expect((await customerRow(c.id)).marketing_opt_in).toBe(false);
    expect(await consents(c.id)).toEqual(['marketing_opt_in', 'marketing_opt_out']);
    expect(await confirmEmails()).toHaveLength(0);
  });

  it('baja por enlace de una suscripción vinculada: preferencia desactivada con fecha', async () => {
    const c = await createCustomer({ email: 'ana@example.test' });
    await processUpdateMarketing(formData({ marketing_opt_in: 'on' }), c.id);
    const [sub] = await subscriptions();
    const before = (await customerRow(c.id)).marketing_opt_in_changed_at as Date;
    expect(await unsubscribeWithToken(unsubscribeToken(sub!.id as string), 'link', later(60_000))).toBe('ok');
    const after = await customerRow(c.id);
    expect(after.marketing_opt_in).toBe(false);
    expect((after.marketing_opt_in_changed_at as Date).getTime()).toBeGreaterThan(before.getTime());
    expect(await consents(c.id)).toEqual(['marketing_opt_in', 'marketing_opt_out']);
  });

  it('confirmar desde el formulario el correo de una cuenta: vinculada y preferencia activada', async () => {
    const c = await createCustomer({ email: 'ana@example.test' });
    await subscribe(subscribeForm({ email: 'ana@example.test' }), { ip: freshIp(), now: later() });
    expect(await confirmSubscription(confirmTokenFrom((await lastConfirmEmail())!))).toBe('ok');
    expect(await subscriptions()).toMatchObject([{ status: 'confirmed', source: 'form', customer_id: c.id }]);
    expect((await customerRow(c.id)).marketing_opt_in).toBe(true);
    expect(await consents(c.id)).toEqual(['marketing_opt_in']);
  });

  it('fila pending del formulario y la cuenta verifica con la preferencia: confirmada y vinculada', async () => {
    await createSubscription({ email: 'ana@example.test' });
    const c = await createCustomer({ email: 'ana@example.test', verified: false, marketingOptIn: true });
    await verify(c.id);
    expect(await subscriptions()).toMatchObject([{ status: 'confirmed', source: 'form', customer_id: c.id }]);
  });

  it('eliminar la cuenta: fuera de la lista con constancia account_deleted', async () => {
    const c = await createCustomer({ email: 'ana@example.test' });
    await processUpdateMarketing(formData({ marketing_opt_in: 'on' }), c.id);
    const out = await processDeleteAccount(formData({ current_password: DEFAULT_PASSWORD }), c, { ip: freshIp(), now: later() });
    expect(out.result).toEqual({ status: 'ok' });
    expect(await subscriptions()).toHaveLength(0);
    expect(await unsubscribeRecords()).toMatchObject([{ reason: 'account_deleted', source: 'account' }]);
  });

  it('moveSubscriptionEmail pasa la suscripción al correo nuevo', async () => {
    const c = await createCustomer({ email: 'ana@example.test' });
    await processUpdateMarketing(formData({ marketing_opt_in: 'on' }), c.id);
    await createSubscription({ email: 'nueva@example.test' });
    await getDb().transaction((tx) => moveSubscriptionEmail(tx, c.id, 'Nueva@Example.test'));
    expect(await subscriptions()).toMatchObject([{ email: 'nueva@example.test', customer_id: c.id, status: 'confirmed' }]);
  });

  it('ningún módulo fuera de sync.ts escribe marketing_opt_in con UPDATE', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !path.replace(/\\/g, '/').endsWith('lib/newsletter/sync.ts')) {
          const src = readFileSync(path, 'utf8');
          if (/\.update\(customers\)[\s\S]{0,200}marketingOptIn/.test(src)) offenders.push(path);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});
