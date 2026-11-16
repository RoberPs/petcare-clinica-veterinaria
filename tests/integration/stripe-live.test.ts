import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createStripeProvider } from '@/lib/payments/stripe';

// Prueba contra Stripe real en modo de pruebas (T103). Se salta sin STRIPE_SECRET_KEY de pruebas
// (sk_test_…): queda fuera de la puerta de CI y nunca toca una clave real (sk_live_…).

const key = process.env.STRIPE_SECRET_KEY ?? '';
const enabled = key.startsWith('sk_test_');

describe.skipIf(!enabled)('Stripe Checkout en modo de pruebas (real)', () => {
  it('crea una sesión, la recupera y el importe coincide', async () => {
    const stripe = createStripeProvider({ secretKey: key, webhookSecret: 'whsec_no_se_usa' });
    const orderId = randomUUID();
    const amountCents = 1234;
    const session = await stripe.createCheckout({
      orderId,
      orderNumber: 'PC-TEST01',
      amountCents,
      email: 'stripe-live@example.test',
      expiresAt: new Date(Date.now() + 31 * 60_000),
      successUrl: 'https://example.test/pedido/confirmado',
      cancelUrl: 'https://example.test/pedido/pago-no-completado',
    });
    expect(session.sessionId).toMatch(/^cs_test_/);
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const retrieved = await stripe.retrieveCheckout(session.sessionId);
    expect(retrieved).toMatchObject({ status: 'open', paid: false, amountCents, orderId });
  }, 30_000);
});
