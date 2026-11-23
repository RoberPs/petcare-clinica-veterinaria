import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { processUpdateMarketing } from '@/lib/account/profile';
import { processRegistration } from '@/lib/account/register';
import { createSubmissionToken } from '@/lib/form-token';
import { createCustomer, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Preferencia de consejos y novedades (US8, FR-041 y FR-042).

const consents = (customerId: string) =>
  q('SELECT kind::text FROM customer_consents WHERE customer_id = $1 ORDER BY created_at, kind', [customerId]);

describe('preferencia de comunicaciones (US8)', () => {
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

  it('el registro con la casilla marcada guarda marketing_opt_in = true y su consentimiento; sin ella, false', async () => {
    const register = (email: string, marketing?: string) =>
      processRegistration(
        formData({
          first_name: 'Ana',
          last_name: 'Prueba',
          email,
          password: 'caballo bateria grapa',
          password_confirm: 'caballo bateria grapa',
          accept_terms: 'on',
          marketing_opt_in: marketing,
          submission_token: createSubmissionToken(),
        }),
        { ip: `198.51.100.${Math.floor(Math.random() * 200)}`, now: new Date(Date.now() + 5_000) },
      );
    await register('si@example.test', 'on');
    await register('no@example.test');
    const rows = await q('SELECT email, marketing_opt_in, marketing_opt_in_changed_at IS NOT NULL AS changed FROM customers ORDER BY email');
    expect(rows).toEqual([
      { email: 'no@example.test', marketing_opt_in: false, changed: false },
      { email: 'si@example.test', marketing_opt_in: true, changed: true },
    ]);
    const [yes] = await q("SELECT id FROM customers WHERE email = 'si@example.test'");
    expect((await consents(yes!.id)).map((r) => r.kind).sort()).toEqual(['marketing_opt_in', 'privacy_terms']);
  });

  it('cambiarla registra un consentimiento solo si el valor cambia', async () => {
    const c = await createCustomer({ marketingOptIn: false });
    expect(await processUpdateMarketing(formData({}), c.id)).toEqual({ status: 'ok' });
    expect((await consents(c.id)).map((r) => r.kind)).toEqual(['privacy_terms']);

    expect(await processUpdateMarketing(formData({ marketing_opt_in: 'on' }), c.id)).toEqual({ status: 'ok' });
    const [on] = await q('SELECT marketing_opt_in, marketing_opt_in_changed_at FROM customers WHERE id = $1', [c.id]);
    expect(on!.marketing_opt_in).toBe(true);
    expect(on!.marketing_opt_in_changed_at).not.toBeNull();

    await processUpdateMarketing(formData({ marketing_opt_in: 'on' }), c.id);
    await processUpdateMarketing(formData({}), c.id);
    const [off] = await q('SELECT marketing_opt_in FROM customers WHERE id = $1', [c.id]);
    expect(off!.marketing_opt_in).toBe(false);
    expect((await consents(c.id)).map((r) => r.kind)).toEqual(['privacy_terms', 'marketing_opt_in', 'marketing_opt_out']);
  });
});
