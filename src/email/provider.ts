import { getEnv } from '@/lib/env';
import { createBrevoProvider } from './brevo';
import { createFakeProvider } from './fake';
import type { EmailProvider } from './types';

export type { EmailProvider, OutgoingEmail, SendResult } from './types';

/** Proveedor según EMAIL_PROVIDER: "brevo" en producción y "fake" en local y en pruebas. */
export function getEmailProvider(): EmailProvider {
  const env = getEnv();
  if (env.EMAIL_PROVIDER === 'brevo') return createBrevoProvider({ apiKey: env.BREVO_API_KEY!, from: env.EMAIL_FROM });
  return createFakeProvider(env.FAKE_EMAIL_URL!, env.EMAIL_FROM);
}
