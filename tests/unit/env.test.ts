import { describe, expect, it } from 'vitest';
import { buildCsp, paymentFormOrigin } from '@/lib/csp';
import { parseEnv } from '@/lib/env';

// Entorno mínimo válido con valores de prueba (ninguno es real).
const base = {
  DATABASE_URL: 'postgres://petcare:petcare@localhost:5433/petcare_test',
  EMAIL_PROVIDER: 'fake',
  EMAIL_FROM: 'PetCare <no-responder@example.test>',
  FAKE_EMAIL_URL: 'http://localhost:8026',
  FORM_SECRET: 'secreto-de-pruebas-unitarias-de-32-caracteres-o-mas',
  CONSENT_VERSION: '1',
  SITE_URL: 'http://localhost:3000',
};
// Se arman por partes para que ningún escáner de secretos las tome por claves.
const testKey = ['sk', 'test', 'x'.repeat(24)].join('_');
const liveKey = ['sk', 'live', 'x'.repeat(24)].join('_');
const webhookSecret = ['whsec', 'y'.repeat(24)].join('_');

describe('PAYMENT_PROVIDER (D1, D2)', () => {
  it('sin valor usa la pasarela simulada', () => {
    expect(parseEnv(base)).toEqual({ ok: true });
  });

  it('acepta Stripe con una clave de prueba y el secreto del webhook', () => {
    expect(
      parseEnv({ ...base, PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: testKey, STRIPE_WEBHOOK_SECRET: webhookSecret }),
    ).toEqual({ ok: true });
  });

  it('rechaza una clave sk_live_', () => {
    const result = parseEnv({ ...base, PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: liveKey, STRIPE_WEBHOOK_SECRET: webhookSecret });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('STRIPE_SECRET_KEY');
  });

  it('rechaza Stripe sin secreto del webhook', () => {
    const result = parseEnv({ ...base, PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: testKey });
    expect(!result.ok && result.error).toContain('STRIPE_WEBHOOK_SECRET');
  });

  it('prohíbe fake en producción salvo con PAYMENT_FAKE_ALLOWED=true', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production', PAYMENT_PROVIDER: 'fake' }).ok).toBe(false);
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', PAYMENT_PROVIDER: 'fake', PAYMENT_FAKE_ALLOWED: 'true', UPLOADS_DIR: '/app/var/uploads' }).ok,
    ).toBe(true);
  });

  // Feature 008 (G4): en producción las fotos subidas necesitan su directorio (volumen).
  it('exige UPLOADS_DIR en producción', () => {
    const prod = { ...base, NODE_ENV: 'production', PAYMENT_PROVIDER: 'fake', PAYMENT_FAKE_ALLOWED: 'true' };
    const result = parseEnv(prod);
    expect(!result.ok && result.error).toContain('UPLOADS_DIR');
    expect(parseEnv({ ...prod, UPLOADS_DIR: '/app/var/uploads' }).ok).toBe(true);
    expect(parseEnv(base).ok).toBe(true);
  });

  it('rechaza un proveedor desconocido', () => {
    expect(parseEnv({ ...base, PAYMENT_PROVIDER: 'redsys' }).ok).toBe(false);
  });
});

describe('CSP form-action (D14)', () => {
  it("'self' con la pasarela simulada", () => {
    expect(paymentFormOrigin('fake')).toBeNull();
    expect(buildCsp('n', false, null)).toContain("form-action 'self';");
  });

  it('añade el origen de Stripe Checkout', () => {
    expect(buildCsp('n', false, paymentFormOrigin('stripe'))).toContain("form-action 'self' https://checkout.stripe.com;");
  });
});
