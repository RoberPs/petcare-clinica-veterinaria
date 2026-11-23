import { describe, expect, it } from 'vitest';
import { PaymentProviderError } from '@/lib/payments/provider';
import { signatureHeader } from '@/lib/payments/signature';
import { createStripeProvider, mapStripeEvent } from '@/lib/payments/stripe';

// Adaptador de Stripe con fetch simulado (contracts/payments.md, D1, D8). Ninguna prueba usa la red.
// Las claves se arman por partes para que ningún escáner las tome por reales.
const secretKey = ['sk', 'test', 'x'.repeat(24)].join('_');
const webhookSecret = ['whsec', 'y'.repeat(24)].join('_');
const now = new Date('2026-11-12T10:00:00Z');
const orderId = '6f1c2a5e-1d2b-4c3d-8e4f-0a1b2c3d4e5f';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(response: unknown, status = 200) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const provider = (impl: typeof fetch) => createStripeProvider({ secretKey, webhookSecret, fetchImpl: impl, now: () => now });

describe('createCheckout', () => {
  const input = {
    orderId,
    orderNumber: 'PC-000123',
    amountCents: 1782,
    email: 'comprador@example.test',
    expiresAt: new Date(now.getTime() + 45 * 60_000),
    successUrl: 'https://petcare.example.test/pedido/confirmado?ref=abc',
    cancelUrl: 'https://petcare.example.test/pedido/pago-no-completado?ref=abc',
  };

  it('envía una sola línea "Pedido PC-…" por el total, en euros y en español', async () => {
    const f = fakeFetch({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const out = await provider(f.impl).createCheckout(input);
    expect(out).toEqual({ sessionId: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const call = f.calls[0]!;
    expect(call.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers['Idempotency-Key']).toBe(`checkout-${orderId}`);
    expect(headers.Authorization).toBe(`Bearer ${secretKey}`);
    const body = new URLSearchParams(call.init.body as string);
    expect(body.get('mode')).toBe('payment');
    expect(body.get('locale')).toBe('es');
    expect(body.get('currency')).toBe('eur');
    expect(body.get('line_items[0][price_data][currency]')).toBe('eur');
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('1782');
    expect(body.get('line_items[0][price_data][product_data][name]')).toBe('Pedido PC-000123');
    expect(body.get('line_items[0][quantity]')).toBe('1');
    expect(body.get('line_items[1][quantity]')).toBeNull();
    expect(body.get('client_reference_id')).toBe(orderId);
    expect(body.get('metadata[order_id]')).toBe(orderId);
    expect(body.get('customer_email')).toBe('comprador@example.test');
    expect(body.get('success_url')).toBe(input.successUrl);
    expect(body.get('cancel_url')).toBe(input.cancelUrl);
    expect(Number(body.get('expires_at'))).toBe(Math.floor(input.expiresAt.getTime() / 1000));
  });

  it('expires_at nunca a menos de 30 min + 60 s de la llamada (D8)', async () => {
    const f = fakeFetch({ id: 'cs_test_2', url: 'https://checkout.stripe.com/c/pay/cs_test_2' });
    await provider(f.impl).createCheckout({ ...input, expiresAt: new Date(now.getTime() + 30 * 60_000) });
    const body = new URLSearchParams(f.calls[0]!.init.body as string);
    expect(Number(body.get('expires_at'))).toBe(Math.floor(now.getTime() / 1000) + 31 * 60);
  });

  it('un error HTTP se convierte en un error tipado', async () => {
    await expect(provider(fakeFetch({ error: {} }, 500).impl).createCheckout(input)).rejects.toMatchObject({
      code: 'http_500',
      retryable: true,
    });
    await expect(provider(fakeFetch({ error: {} }, 400).impl).createCheckout(input)).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(provider(fakeFetch({ error: {} }, 400).impl).createCheckout(input)).rejects.toMatchObject({ retryable: false });
  });
});

describe('retrieveCheckout y refund', () => {
  it('traduce la sesión', async () => {
    const f = fakeFetch({
      id: 'cs_test_1',
      status: 'complete',
      payment_status: 'paid',
      payment_intent: 'pi_1',
      amount_total: 1782,
      client_reference_id: orderId,
    });
    expect(await provider(f.impl).retrieveCheckout('cs_test_1')).toEqual({
      status: 'complete',
      paid: true,
      paymentId: 'pi_1',
      amountCents: 1782,
      orderId,
    });
    expect(f.calls[0]!.url).toBe('https://api.stripe.com/v1/checkout/sessions/cs_test_1');
    expect(f.calls[0]!.init.method).toBe('GET');
  });

  it('rechaza un id de sesión con otro formato sin llamar', async () => {
    const f = fakeFetch({});
    await expect(provider(f.impl).retrieveCheckout('../v1/charges')).rejects.toMatchObject({ code: 'bad_session_id' });
    expect(f.calls).toHaveLength(0);
  });

  it('reembolso con Idempotency-Key refund-<pedido>', async () => {
    const f = fakeFetch({ id: 're_1' });
    expect(await provider(f.impl).refund({ paymentId: 'pi_1', orderId, amountCents: 1782 })).toEqual({ refundId: 're_1' });
    expect((f.calls[0]!.init.headers as Record<string, string>)['Idempotency-Key']).toBe(`refund-${orderId}`);
    const body = new URLSearchParams(f.calls[0]!.init.body as string);
    expect(body.get('payment_intent')).toBe('pi_1');
    expect(body.get('amount')).toBe('1782');
  });
});

describe('eventos', () => {
  it('checkout.session.completed pagado', () => {
    expect(
      mapStripeEvent({
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 500, client_reference_id: orderId } },
      }),
    ).toEqual({ id: 'evt_1', type: 'checkout.completed', sessionId: 'cs_1', paid: true, paymentId: 'pi_1', amountCents: 500, orderId });
  });

  it('checkout.session.expired, charge.refunded e ignorados', () => {
    expect(mapStripeEvent({ id: 'evt_2', type: 'checkout.session.expired', data: { object: { id: 'cs_1', metadata: { order_id: orderId } } } })).toEqual({
      id: 'evt_2',
      type: 'checkout.expired',
      sessionId: 'cs_1',
      orderId,
    });
    expect(
      mapStripeEvent({ id: 'evt_3', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_1', refunds: { data: [{ id: 're_1' }] } } } }),
    ).toEqual({ id: 'evt_3', type: 'refund.succeeded', paymentId: 'pi_1', refundId: 're_1' });
    expect(mapStripeEvent({ id: 'evt_4', type: 'customer.created', data: { object: {} } })).toEqual({
      id: 'evt_4',
      type: 'ignored',
      rawType: 'customer.created',
    });
  });

  it('verifyWebhook comprueba la firma antes de leer el cuerpo', () => {
    const p = provider(fakeFetch({}).impl);
    const raw = JSON.stringify({ id: 'evt_9', type: 'checkout.session.expired', data: { object: { id: 'cs_9' } } });
    const ok = new Headers({ 'stripe-signature': signatureHeader(raw, webhookSecret, now) });
    expect(p.verifyWebhook(raw, ok, now)).toMatchObject({ id: 'evt_9', type: 'checkout.expired' });
    const bad = new Headers({ 'stripe-signature': signatureHeader(raw, 'otro-secreto', now) });
    expect(() => p.verifyWebhook(raw, bad, now)).toThrow(/invalid_signature/);
  });
});
