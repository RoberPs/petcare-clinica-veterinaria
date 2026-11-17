import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from '@/app/api/boletin/baja/route';
import { loadContentFile } from '@/content/load';
import { emailHmac } from '@/lib/newsletter/hash';
import { unsubscribeToken } from '@/lib/newsletter/tokens';
import { peekUnsubscribe, unsubscribeWithToken } from '@/lib/newsletter/unsubscribe';
import { resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { createSubscription, subscriptions, unsubscribeRecords } from './helpers/newsletter';

// Baja del boletín (E7, E10): fila borrada, constancia anónima e idempotencia.

const oneClick = (token: string | null) =>
  POST(
    new Request(`http://localhost/api/boletin/baja${token ? `?t=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }),
  );

describe('baja del boletín (US4)', () => {
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

  for (const status of ['confirmed', 'pending'] as const) {
    it(`baja de una suscripción ${status}: fila borrada y constancia anónima`, async () => {
      const sub = await createSubscription({ status });
      const token = unsubscribeToken(sub.id);
      expect(await peekUnsubscribe(token)).toBe('valid');
      expect(await unsubscribeWithToken(token, 'link')).toBe('ok');
      expect(await subscriptions()).toHaveLength(0);
      const [record] = await unsubscribeRecords();
      expect(record).toMatchObject({ email_hmac: emailHmac('lector@example.test'), source: 'form', policy_version: '1.0', reason: 'link' });
      expect(record!.email_hmac).not.toContain('lector');
      expect(record!.subscribed_at).toBeInstanceOf(Date);
      expect(record!.confirmed_at === null).toBe(status === 'pending');
    });
  }

  it('segunda baja: "ya no suscrito" sin error ni otra constancia', async () => {
    const sub = await createSubscription({ status: 'confirmed' });
    const token = unsubscribeToken(sub.id);
    await unsubscribeWithToken(token, 'link');
    expect(await unsubscribeWithToken(token, 'link')).toBe('already');
    expect(await peekUnsubscribe(token)).toBe('already');
    expect(await unsubscribeRecords()).toHaveLength(1);
  });

  it('token manipulado: no válido y nada cambia', async () => {
    const sub = await createSubscription({ status: 'confirmed' });
    const token = unsubscribeToken(sub.id);
    const tampered = token.slice(0, -3) + (token.endsWith('AAA') ? 'BBB' : 'AAA');
    expect(await unsubscribeWithToken(tampered, 'link')).toBe('invalid');
    expect(await peekUnsubscribe('basura')).toBe('invalid');
    expect(await subscriptions()).toHaveLength(1);
  });

  it('el token de una suscripción anterior no da de baja la nueva', async () => {
    const first = await createSubscription({ status: 'confirmed' });
    const oldToken = unsubscribeToken(first.id);
    await unsubscribeWithToken(oldToken, 'link');
    await createSubscription({ status: 'confirmed' });
    expect(await unsubscribeWithToken(oldToken, 'link')).toBe('already');
    expect(await subscriptions()).toHaveLength(1);
  });

  it('POST de un clic: 200 siempre y motivo one_click', async () => {
    const sub = await createSubscription({ status: 'confirmed' });
    const res = await oneClick(unsubscribeToken(sub.id));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(await unsubscribeRecords()).toMatchObject([{ reason: 'one_click' }]);
    expect((await oneClick(unsubscribeToken(sub.id))).status).toBe(200);
    expect((await oneClick('manipulado')).status).toBe(200);
    expect((await oneClick(null)).status).toBe(200);
  });

  it('GET de la ruta de un clic: 405', () => {
    expect(GET().status).toBe(405);
  });
});
