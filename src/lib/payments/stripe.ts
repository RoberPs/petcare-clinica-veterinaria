import {
  PaymentProviderError,
  sessionExpiry,
  type CheckoutInput,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
} from './provider';
import { verifyStripeSignature } from './signature';

// Stripe Checkout en modo de pruebas por HTTP, sin SDK (D1): tres llamadas con fetch y
// application/x-www-form-urlencoded. La clave solo puede ser de prueba (lo comprueba env.ts).

export const STRIPE_API = 'https://api.stripe.com';
export const STRIPE_CHECKOUT_ORIGIN = 'https://checkout.stripe.com';
const TIMEOUT_MS = 10_000;

export interface StripeOptions {
  secretKey: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
  apiBase?: string;
  now?: () => Date;
}

/** Cuerpo x-www-form-urlencoded con la notación de corchetes de Stripe. */
export function formBody(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) params.append(k, String(v));
  return params.toString();
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

function sessionToCheckout(s: Json): CheckoutSession {
  const status = str(s.status);
  return {
    status: status === 'complete' ? 'complete' : status === 'expired' ? 'expired' : 'open',
    paid: s.payment_status === 'paid',
    paymentId: str(s.payment_intent) ?? str(obj(s.payment_intent).id),
    amountCents: num(s.amount_total),
    orderId: str(s.client_reference_id) ?? str(obj(s.metadata).order_id),
  };
}

/** Evento de Stripe → evento de la tienda (contracts/payments.md). */
export function mapStripeEvent(event: Json): PaymentEvent {
  const id = str(event.id) ?? '';
  const type = str(event.type) ?? '';
  const o = obj(obj(event.data).object);
  if (type === 'checkout.session.completed') {
    const c = sessionToCheckout(o);
    return { id, type: 'checkout.completed', sessionId: str(o.id) ?? '', paid: c.paid, paymentId: c.paymentId, amountCents: c.amountCents, orderId: c.orderId };
  }
  if (type === 'checkout.session.expired') {
    return { id, type: 'checkout.expired', sessionId: str(o.id) ?? '', orderId: sessionToCheckout(o).orderId };
  }
  if (type === 'charge.refunded') {
    const refunds = obj(o.refunds).data;
    const first = Array.isArray(refunds) ? obj(refunds[0]) : {};
    return { id, type: 'refund.succeeded', paymentId: str(o.payment_intent) ?? '', refundId: str(first.id) ?? str(o.id) ?? '' };
  }
  return { id, type: 'ignored', rawType: type.slice(0, 60) };
}

export function createStripeProvider(options: StripeOptions): PaymentProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.apiBase ?? STRIPE_API;
  const now = options.now ?? (() => new Date());

  async function call(method: 'GET' | 'POST', path: string, body?: string, idempotencyKey?: string): Promise<Json> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${options.secretKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PaymentProviderError('network', true);
    }
    if (!res.ok) throw new PaymentProviderError(`http_${res.status}`, res.status === 429 || res.status >= 500);
    try {
      return (await res.json()) as Json;
    } catch {
      throw new PaymentProviderError('bad_response', true);
    }
  }

  return {
    name: 'stripe',
    checkoutOrigin: STRIPE_CHECKOUT_ORIGIN,

    async createCheckout(input: CheckoutInput) {
      const expiresAt = sessionExpiry(input.expiresAt, now());
      const json = await call(
        'POST',
        '/v1/checkout/sessions',
        formBody({
          mode: 'payment',
          'payment_method_types[0]': 'card',
          locale: 'es',
          currency: 'eur',
          'line_items[0][quantity]': 1,
          'line_items[0][price_data][currency]': 'eur',
          'line_items[0][price_data][unit_amount]': input.amountCents,
          'line_items[0][price_data][product_data][name]': `Pedido ${input.orderNumber}`,
          client_reference_id: input.orderId,
          'metadata[order_id]': input.orderId,
          'payment_intent_data[metadata][order_id]': input.orderId,
          customer_email: input.email,
          expires_at: Math.floor(expiresAt.getTime() / 1000),
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
        }),
        `checkout-${input.orderId}`,
      );
      const sessionId = str(json.id);
      const url = str(json.url);
      if (!sessionId || !url) throw new PaymentProviderError('bad_response', true);
      return { sessionId, url };
    },

    async retrieveCheckout(sessionId: string) {
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new PaymentProviderError('bad_session_id', false);
      return sessionToCheckout(await call('GET', `/v1/checkout/sessions/${sessionId}`));
    },

    async refund(input) {
      const json = await call(
        'POST',
        '/v1/refunds',
        formBody({ payment_intent: input.paymentId, amount: input.amountCents, 'metadata[order_id]': input.orderId }),
        `refund-${input.orderId}`,
      );
      const refundId = str(json.id);
      if (!refundId) throw new PaymentProviderError('bad_response', true);
      return { refundId };
    },

    verifyWebhook(rawBody: string, headers: Headers, at: Date) {
      verifyStripeSignature(rawBody, headers.get('stripe-signature'), options.webhookSecret, at);
      let event: Json;
      try {
        event = JSON.parse(rawBody) as Json;
      } catch {
        throw new PaymentProviderError('bad_event', false);
      }
      return mapStripeEvent(event);
    },
  };
}
