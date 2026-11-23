import { InvalidSignature } from './signature';

// Proveedor de pago intercambiable (D2, contracts/payments.md): Stripe Checkout en modo de pruebas
// o la pasarela simulada ("fake") para local y pruebas.

export { InvalidSignature };

export interface CheckoutInput {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  email: string;
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  status: 'open' | 'complete' | 'expired';
  paid: boolean;
  paymentId: string | null;
  amountCents: number;
  orderId: string | null;
}

export type PaymentEvent =
  | {
      id: string;
      type: 'checkout.completed';
      sessionId: string;
      paid: boolean;
      paymentId: string | null;
      amountCents: number;
      orderId: string | null;
    }
  | { id: string; type: 'checkout.expired'; sessionId: string; orderId: string | null }
  | { id: string; type: 'refund.succeeded'; paymentId: string; refundId: string }
  | { id: string; type: 'ignored'; rawType: string };

export interface PaymentProvider {
  name: 'stripe' | 'fake';
  /** Origen de la página de pago, para form-action de la CSP ('self' en la simulada). */
  checkoutOrigin: string | null;
  createCheckout(input: CheckoutInput): Promise<{ sessionId: string; url: string }>;
  retrieveCheckout(sessionId: string): Promise<CheckoutSession>;
  refund(input: { paymentId: string; orderId: string; amountCents: number }): Promise<{ refundId: string }>;
  /** Lanza InvalidSignature si la firma no es válida. */
  verifyWebhook(rawBody: string, headers: Headers, now: Date): PaymentEvent;
}

/** Error de la pasarela (HTTP, red o respuesta inesperada). `code` nunca lleva datos personales. */
export class PaymentProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(`payment_provider:${code}`);
    this.name = 'PaymentProviderError';
  }
}

/** Stripe exige que la sesión caduque al menos 30 minutos después de crearla (D8). */
export const MIN_SESSION_MS = 30 * 60_000 + 60_000;

export function sessionExpiry(reservationExpiresAt: Date, now: Date): Date {
  return new Date(Math.max(reservationExpiresAt.getTime(), now.getTime() + MIN_SESSION_MS));
}

let override: PaymentProvider | null = null;

/** Solo para pruebas: sustituye el proveedor. */
export function setPaymentProviderForTests(provider: PaymentProvider | null): void {
  override = provider;
}

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (override) return override;
  if ((process.env.PAYMENT_PROVIDER ?? 'fake') === 'stripe') {
    const { getEnv } = await import('@/lib/env');
    const env = getEnv();
    const { createStripeProvider } = await import('./stripe');
    return createStripeProvider({ secretKey: env.STRIPE_SECRET_KEY!, webhookSecret: env.STRIPE_WEBHOOK_SECRET! });
  }
  const { fakeProvider } = await import('./fake');
  return fakeProvider;
}
