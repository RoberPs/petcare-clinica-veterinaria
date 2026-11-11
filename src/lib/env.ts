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
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === 'brevo' && !env.BREVO_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['BREVO_API_KEY'], message: 'falta BREVO_API_KEY (EMAIL_PROVIDER=brevo)' });
    }
    if (env.EMAIL_PROVIDER === 'fake' && !env.FAKE_EMAIL_URL) {
      ctx.addIssue({ code: 'custom', path: ['FAKE_EMAIL_URL'], message: 'falta FAKE_EMAIL_URL (EMAIL_PROVIDER=fake)' });
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
