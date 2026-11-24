import { z } from 'zod';

// Variables de entorno de la aplicación, validadas al primer uso.
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const envSchema = z
  .object({
    DATABASE_URL: z.string({ error: 'falta DATABASE_URL' }).url('DATABASE_URL no es una URL válida'),
    EMAIL_PROVIDER: z.enum(['brevo', 'fake'], { error: 'EMAIL_PROVIDER debe ser "brevo" o "fake"' }),
    BREVO_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    EMAIL_FROM: z.string({ error: 'falta EMAIL_FROM' }).min(3, 'falta EMAIL_FROM'),
    FAKE_EMAIL_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    FORM_SECRET: z
      .string({ error: 'falta FORM_SECRET' })
      .min(32, 'FORM_SECRET debe tener al menos 32 caracteres'),
    CONSENT_VERSION: z.string({ error: 'falta CONSENT_VERSION' }).min(1, 'falta CONSENT_VERSION'),
    TRUSTED_PROXY_IPS: z.preprocess(emptyToUndefined, z.string().optional()),
    SITE_URL: z.string({ error: 'falta SITE_URL' }).url('SITE_URL no es una URL válida'),
    // Feature 005 (D1, D2): pasarela de pago.
    NODE_ENV: z.preprocess(emptyToUndefined, z.string().optional()),
    PAYMENT_PROVIDER: z.preprocess(
      emptyToUndefined,
      z.enum(['stripe', 'fake'], { error: 'PAYMENT_PROVIDER debe ser "stripe" o "fake"' }).default('fake'),
    ),
    STRIPE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    STRIPE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
    PAYMENT_FAKE_ALLOWED: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).default('false')),
    // Feature 008 (G4): directorio de las fotos subidas. Obligatorio en producción.
    UPLOADS_DIR: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === 'brevo' && !env.BREVO_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['BREVO_API_KEY'], message: 'falta BREVO_API_KEY (EMAIL_PROVIDER=brevo)' });
    }
    if (env.EMAIL_PROVIDER === 'fake' && !env.FAKE_EMAIL_URL) {
      ctx.addIssue({ code: 'custom', path: ['FAKE_EMAIL_URL'], message: 'falta FAKE_EMAIL_URL (EMAIL_PROVIDER=fake)' });
    }
    // Principio VII: solo claves de prueba de Stripe. No hay forma de usar una clave real sin cambiar el código.
    if (env.PAYMENT_PROVIDER === 'stripe') {
      if (!env.STRIPE_SECRET_KEY || !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY)) {
        ctx.addIssue({
          code: 'custom',
          path: ['STRIPE_SECRET_KEY'],
          message: 'STRIPE_SECRET_KEY debe ser una clave de prueba (sk_test_… o rk_test_…)',
        });
      }
      if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
        ctx.addIssue({ code: 'custom', path: ['STRIPE_WEBHOOK_SECRET'], message: 'STRIPE_WEBHOOK_SECRET debe empezar por whsec_' });
      }
    }
    if (env.NODE_ENV === 'production' && !env.UPLOADS_DIR) {
      ctx.addIssue({ code: 'custom', path: ['UPLOADS_DIR'], message: 'falta UPLOADS_DIR (producción)' });
    }
    if (env.PAYMENT_PROVIDER === 'fake' && env.NODE_ENV === 'production' && env.PAYMENT_FAKE_ALLOWED !== 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'PAYMENT_PROVIDER=fake no se permite en producción salvo con PAYMENT_FAKE_ALLOWED=true',
      });
    }
  });

export type Env = z.infer<typeof envSchema> & { trustedProxyIps: string[] };

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.') || '(entorno)'}: ${i.message}`).join('; ');
    throw new Error(`Configuración de entorno no válida — ${details}`);
  }
  cached = {
    ...parsed.data,
    trustedProxyIps: (parsed.data.TRUSTED_PROXY_IPS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return cached;
}

/** Valida un entorno sin cachearlo (pruebas y comprobaciones de arranque). */
export function parseEnv(source: Record<string, string | undefined>): { ok: true } | { ok: false; error: string } {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return { ok: true };
  return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || '(entorno)'}: ${i.message}`).join('; ') };
}

/**
 * Directorio de las fotos subidas (G4). Se lee sin validar el resto del entorno, porque lo usan
 * también el route handler de las fotos y los tests. Fuera de producción vale `./var/uploads`.
 */
export function uploadsDir(): string {
  const value = process.env.UPLOADS_DIR?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error('Configuración de entorno no válida — falta UPLOADS_DIR');
  return './var/uploads';
}

/** Solo para pruebas: olvida la configuración leída. */
export function resetEnvCache(): void {
  cached = null;
}

/** Lee una sola variable obligatoria sin validar el resto (útil en módulos que no necesitan todo). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Configuración de entorno no válida — falta ${name}`);
  return value;
}
