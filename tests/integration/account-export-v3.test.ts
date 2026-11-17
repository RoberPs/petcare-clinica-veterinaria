import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { handleExportRequest } from '@/lib/account/export';
import { createCustomer, createSessionFor, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { createSubscription } from './helpers/newsletter';

// "Descargar mis datos", versión 3 (feature 006, contracts/export-format.md): la suscripción viva
// al boletín vinculada a la cuenta, y nada de las constancias de baja anónimas.

const HOST = 'petcare.example';
function exportRequest(cookie: string) {
  return new Request(`https://${HOST}/api/account/export`, {
    method: 'POST',
    headers: { host: HOST, cookie: `pc_session=${cookie}`, origin: `https://${HOST}`, 'sec-fetch-site': 'same-origin' },
  });
}

interface ExportV3 {
  format_version: number;
  communications: {
    marketing_opt_in: boolean;
    changed_at: string | null;
    newsletter: {
      status: string;
      source: string;
      subscribed_at: string;
      confirmed_at: string | null;
      policy_version: string;
    } | null;
  };
}

async function exportFor(customerId: string): Promise<ExportV3> {
  const res = await handleExportRequest(exportRequest(await createSessionFor(customerId)), new Date());
  expect(res.status).toBe(200);
  return (await res.json()) as ExportV3;
}

const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0[12]:00$/;

describe('exportación v3: boletín (US5)', () => {
  beforeAll(async () => {
    const db = await setupTestDb();
    await truncateAll();
    await loadContentFile(db, 'content/petcare.yaml');
  });
  beforeEach(async () => {
    await resetAccountState();
    await q('DELETE FROM newsletter_subscriptions');
    await q('DELETE FROM newsletter_unsubscribe_records');
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('sin suscripción viva, newsletter es null y se conservan los campos de la v2', async () => {
    const c = await createCustomer();
    const data = await exportFor(c.id);
    expect(data.format_version).toBe(3);
    expect(data.communications).toEqual({ marketing_opt_in: false, changed_at: null, newsletter: null });
  });

  it('exporta la suscripción confirmada de la cuenta con etiquetas en español', async () => {
    const c = await createCustomer({ email: 'suscrita@example.test', marketingOptIn: true });
    await createSubscription({ email: 'suscrita@example.test', status: 'confirmed', source: 'account', customerId: c.id });
    const { newsletter } = (await exportFor(c.id)).communications;
    expect(newsletter).toMatchObject({ status: 'Confirmada', source: 'Cuenta de cliente', policy_version: '1.0' });
    expect(newsletter!.subscribed_at).toMatch(ZONED);
    expect(newsletter!.confirmed_at).toMatch(ZONED);
  });

  it('exporta una suscripción pendiente del formulario vinculada a la cuenta', async () => {
    const c = await createCustomer({ email: 'pendiente@example.test' });
    await createSubscription({ email: 'pendiente@example.test', status: 'pending', source: 'form', customerId: c.id });
    const { newsletter } = (await exportFor(c.id)).communications;
    expect(newsletter).toMatchObject({ status: 'Pendiente de confirmar', source: 'Formulario', confirmed_at: null });
  });

  it('no incluye suscripciones de otra cuenta ni sin vincular, ni las constancias de baja', async () => {
    const c = await createCustomer({ email: 'propia@example.test' });
    const other = await createCustomer({ email: 'ajena@example.test' });
    await createSubscription({ email: 'ajena@example.test', status: 'confirmed', customerId: other.id });
    await createSubscription({ email: 'propia@example.test', status: 'confirmed', customerId: null });
    await q(
      `INSERT INTO newsletter_unsubscribe_records
         (email_hmac, source, policy_version, subscribed_at, confirmed_at, unsubscribed_at, reason)
       VALUES ('huella', 'account', '1.0', now(), now(), now(), 'account')`,
    );
    const data = await exportFor(c.id);
    expect(data.communications.newsletter).toBeNull();
    expect(JSON.stringify(data)).not.toContain('huella');
  });
});
