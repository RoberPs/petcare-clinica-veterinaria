import { randomUUID } from 'node:crypto';
import { requireEnv } from '@/lib/env';
import { hmacHex } from '@/lib/signing';
import { paymentBySession } from '@/db/queries/orders';
import type { CheckoutInput, CheckoutSession, PaymentEvent, PaymentProvider } from './provider';
import { signatureHeader, verifyStripeSignature } from './signature';

// Pasarela simulada (D2) para local, integración y e2e: la "página de pago" es /pago-simulado/<id>,
// que solo existe con PAYMENT_PROVIDER=fake. Sus eventos van firmados con una clave derivada de
// FORM_SECRET y pasan por el mismo handlePaymentEvent que el aviso real.

export const FAKE_SESSION_RE = /^fake_[0-9a-f-]{36}$/i;

export const fakeSecret = () => hmacHex('fake-payments', requireEnv('FORM_SECRET'));

const siteUrl = () => (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const fakeProvider: PaymentProvider = {
  name: 'fake',
  checkoutOrigin: null,

  // Una sesión por pedido e idempotente, como Stripe con Idempotency-Key: checkout-<pedido>.
  async createCheckout(input: CheckoutInput) {
    const sessionId = `fake_${input.orderId}`;
    return { sessionId, url: `${siteUrl()}/pago-simulado/${sessionId}` };
  },

  async retrieveCheckout(sessionId: string): Promise<CheckoutSession> {
    const payment = await paymentBySession(sessionId);
    if (!payment) return { status: 'expired', paid: false, paymentId: null, amountCents: 0, orderId: null };
    const paid = payment.status === 'succeeded' || payment.status === 'refunded';
    const expired = payment.status === 'expired' || (!paid && payment.expiresAt.getTime() <= Date.now());
    return {
      status: paid ? 'complete' : expired ? 'expired' : 'open',
      paid,
      paymentId: payment.providerPaymentId,
      amountCents: payment.amountCents,
      orderId: payment.orderId,
    };
  },

  async refund() {
    return { refundId: `fake_re_${randomUUID()}` };
  },

  verifyWebhook(rawBody: string, headers: Headers, now: Date): PaymentEvent {
    verifyStripeSignature(rawBody, headers.get('stripe-signature'), fakeSecret(), now);
    const event = JSON.parse(rawBody) as PaymentEvent;
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') throw new Error('bad_event');
    return event;
  },
};

/** Evento de pago completado de una sesión simulada. */
export function fakeCompletedEvent(sessionId: string, amountCents: number, orderId: string | null = null): PaymentEvent {
  return { id: `evt_fake_${randomUUID()}`, type: 'checkout.completed', sessionId, paid: true, paymentId: `fake_pi_${randomUUID()}`, amountCents, orderId };
}

/**
 * Envía un evento firmado al mismo manejador que el aviso real. `duplicate` lo manda dos veces a
 * la vez y `delayMs` espera antes (pruebas de duplicados y carreras).
 */
export async function emitFakeEvent(
  event: PaymentEvent,
  options: { duplicate?: boolean; delayMs?: number; now?: Date } = {},
): Promise<number[]> {
  const { handleWebhookRequest } = await import('./webhook');
  if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
  const now = options.now ?? new Date();
  const raw = JSON.stringify(event);
  const headers = new Headers({ 'stripe-signature': signatureHeader(raw, fakeSecret(), now) });
  const sends = options.duplicate ? [0, 1] : [0];
  const results = await Promise.all(sends.map(() => handleWebhookRequest(raw, headers, now)));
  return results.map((r) => r.status);
}

export const isFakeSession = (id: string) => FAKE_SESSION_RE.test(id);
