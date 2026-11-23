import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { NEWSLETTER_MESSAGES } from '@/domain/newsletter-schemas';
import { confirmSubscription, peekConfirmation } from '@/lib/newsletter/confirm';
import { resendConfirmation, subscribe } from '@/lib/newsletter/subscribe';
import { createSubmissionToken } from '@/lib/form-token';
import { q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import {
  confirmEmails,
  confirmTokenFrom,
  createSubscription,
  freshIp,
  lastConfirmEmail,
  later,
  subscribeForm,
  subscriptions,
} from './helpers/newsletter';
import { seedPosts } from './helpers/posts';

// Alta con doble confirmación (E8, E9): respuesta uniforme, límites e idempotencia.

const HOUR = 60 * 60 * 1000;

describe('alta en el boletín (US4)', () => {
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

  it('correo nuevo: fila pending y un correo de confirmación', async () => {
    const out = await subscribe(subscribeForm({ email: '  Lector@Example.TEST ' }), { ip: freshIp(), now: later() });
    expect(out.result).toEqual({ status: 'ok' });
    expect(out.outboxIds).toHaveLength(1);
    const [row] = await subscriptions();
    expect(row).toMatchObject({ email: 'lector@example.test', status: 'pending', source: 'form', customer_id: null });
    const [policy] = await q("SELECT version FROM legal_pages WHERE kind = 'boletin'");
    expect(await q('SELECT policy_version FROM newsletter_subscriptions')).toEqual([{ policy_version: policy!.version }]);
    const mail = await lastConfirmEmail();
    expect(mail!.to.email).toBe('lector@example.test');
    expect(mail!.headers?.['List-Unsubscribe']).toMatch(/^<.+\/api\/boletin\/baja\?t=.+>$/);
  });

  it('pending de hace menos de 1 h: no hace nada', async () => {
    await createSubscription({ confirmSentAt: new Date(Date.now() - 10 * 60 * 1000) });
    const out = await subscribe(subscribeForm(), { ip: freshIp(), now: later() });
    expect(out).toEqual({ result: { status: 'ok' }, outboxIds: [] });
    expect(await confirmEmails()).toHaveLength(0);
  });

  it('pending de hace 1 h o más: token nuevo y el anterior deja de valer', async () => {
    const old = await createSubscription({ confirmSentAt: new Date(Date.now() - 2 * HOUR) });
    const out = await subscribe(subscribeForm(), { ip: freshIp(), now: later() });
    expect(out.result).toEqual({ status: 'ok' });
    expect(out.outboxIds).toHaveLength(1);
    expect(await peekConfirmation(old.token)).toBe('invalid');
    const fresh = confirmTokenFrom((await lastConfirmEmail())!);
    expect(await peekConfirmation(fresh)).toBe('valid');
    expect(await subscriptions()).toHaveLength(1);
  });

  it('confirmed: no hace nada ni envía nada', async () => {
    await createSubscription({ status: 'confirmed' });
    const out = await subscribe(subscribeForm(), { ip: freshIp(), now: later() });
    expect(out).toEqual({ result: { status: 'ok' }, outboxIds: [] });
    expect(await confirmEmails()).toHaveLength(0);
  });

  it('el resultado es idéntico en todos los estados', async () => {
    const results = [];
    results.push((await subscribe(subscribeForm({ email: 'nuevo@example.test' }), { ip: freshIp(), now: later() })).result);
    await createSubscription({ email: 'pendiente@example.test' });
    results.push((await subscribe(subscribeForm({ email: 'pendiente@example.test' }), { ip: freshIp(), now: later() })).result);
    await createSubscription({ email: 'confirmado@example.test', status: 'confirmed' });
    results.push((await subscribe(subscribeForm({ email: 'confirmado@example.test' }), { ip: freshIp(), now: later() })).result);
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it('sin aceptar la política o con un correo no válido: error junto al campo', async () => {
    const noPolicy = await subscribe(subscribeForm({ accept_policy: undefined }), { ip: freshIp(), now: later() });
    expect(noPolicy.result).toMatchObject({ status: 'invalid', fieldErrors: { accept_policy: NEWSLETTER_MESSAGES.accept_policy } });
    const badEmail = await subscribe(subscribeForm({ email: 'no-es-un-correo' }), { ip: freshIp(), now: later() });
    expect(badEmail.result).toMatchObject({ status: 'invalid', fieldErrors: { email: NEWSLETTER_MESSAGES.email } });
    expect(await subscriptions()).toHaveLength(0);
  });

  it('límite por origen: 5 cada 10 minutos', async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      const out = await subscribe(subscribeForm({ email: `l${i}@example.test` }), { ip, now: later() });
      expect(out.result).toEqual({ status: 'ok' });
    }
    const blocked = await subscribe(subscribeForm({ email: 'l6@example.test' }), { ip, now: later() });
    expect(blocked.result).toMatchObject({ status: 'rate_limited' });
    expect(await subscriptions()).toHaveLength(5);
  });

  it('honeypot: éxito aparente sin guardar nada', async () => {
    const out = await subscribe(subscribeForm({ web: 'http://spam' }), { ip: freshIp(), now: later() });
    expect(out).toEqual({ result: { status: 'ok' }, outboxIds: [] });
    expect(await subscriptions()).toHaveLength(0);
  });

  it('reenvío del mismo submission_token: misma respuesta y un solo correo', async () => {
    const token = createSubmissionToken();
    const first = await subscribe(subscribeForm({ submission_token: token }), { ip: freshIp(), now: later() });
    const again = await subscribe(subscribeForm({ submission_token: token }), { ip: freshIp(), now: later() });
    expect(again.result).toEqual(first.result);
    expect(await confirmEmails()).toHaveLength(1);
  });

  it('con el boletín desactivado se rechaza', async () => {
    await seedPosts((c) => {
      c.newsletter.enabled = false;
    });
    try {
      const out = await subscribe(subscribeForm(), { ip: freshIp(), now: later() });
      expect(out.result).toEqual({ status: 'disabled' });
      expect(await subscriptions()).toHaveLength(0);
    } finally {
      await seedPosts();
    }
  });

  it('pedir otro enlace nunca crea una fila nueva', async () => {
    const out = await resendConfirmation(subscribeForm({ email: 'nadie@example.test', accept_policy: undefined }), {
      ip: freshIp(),
      now: later(),
    });
    expect(out).toEqual({ result: { status: 'ok' }, outboxIds: [] });
    expect(await subscriptions()).toHaveLength(0);
  });

  describe('confirmación', () => {
    it('token vigente: confirma; segunda vez: "ya confirmada"', async () => {
      await subscribe(subscribeForm(), { ip: freshIp(), now: later() });
      const token = confirmTokenFrom((await lastConfirmEmail())!);
      expect(await peekConfirmation(token)).toBe('valid');
      // El GET (peek) no gasta el token.
      expect(await subscriptions()).toMatchObject([{ status: 'pending' }]);
      expect(await confirmSubscription(token)).toBe('ok');
      expect(await subscriptions()).toMatchObject([{ status: 'confirmed' }]);
      expect(await confirmSubscription(token)).toBe('already');
      expect(await peekConfirmation(token)).toBe('already');
    });

    it('caducado (7 días), sustituido o manipulado: el mismo estado "no válido"', async () => {
      const expired = await createSubscription({ email: 'a@example.test', expiresAt: new Date(Date.now() - 1000) });
      expect(await peekConfirmation(expired.token)).toBe('invalid');
      expect(await confirmSubscription(expired.token)).toBe('invalid');

      const replaced = await createSubscription({ email: 'b@example.test', confirmSentAt: new Date(Date.now() - 2 * HOUR) });
      await subscribe(subscribeForm({ email: 'b@example.test' }), { ip: freshIp(), now: later() });
      expect(await confirmSubscription(replaced.token)).toBe('invalid');

      const tampered = replaced.token.slice(0, -2) + (replaced.token.endsWith('AA') ? 'BB' : 'AA');
      expect(await confirmSubscription(tampered)).toBe('invalid');
      expect(await confirmSubscription('no-es-un-token')).toBe('invalid');
    });
  });
});
