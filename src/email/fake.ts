import { createBrevoProvider } from './brevo';
import type { EmailProvider } from './types';

// Proveedor falso para local y pruebas: habla la misma API que Brevo contra scripts/fake-email-provider.ts.
export function createFakeProvider(url: string, from: string): EmailProvider {
  return createBrevoProvider({ apiKey: 'fake-key', from, baseUrl: url, timeoutMs: 5_000 });
}
