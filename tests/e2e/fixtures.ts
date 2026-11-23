import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';
import { FAKE_EMAIL_PORT } from '../test-env';
import { createCustomer, createSessionFor, type TestCustomer } from './db';

// Fixtures comunes de Playwright: accesibilidad, aviso de cookies y buzón falso.

export async function axeCheck(page: Page, options: { exclude?: string[] } = {}): Promise<void> {
  // axe se inyecta con JavaScript: en el perfil sin JavaScript no puede ejecutarse (los otros dos lo cubren).
  if (isNoJs(test.info().project.name)) return;
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  expect(summary, 'axe no debe encontrar infracciones WCAG A/AA').toEqual([]);
}

/** Cierra el aviso de cookies rechazando (si está), para que no tape el contenido. */
export async function dismissCookies(page: Page): Promise<void> {
  const banner = page.getByRole('region', { name: 'Aviso de cookies' });
  if (await banner.isVisible()) {
    await banner.getByRole('button', { name: 'Rechazar' }).click();
    await expect(banner).toBeHidden();
  }
}

export interface FakeEmailRecord {
  id: string;
  body: {
    to?: { email: string }[];
    subject?: string;
    textContent?: string;
    htmlContent?: string;
    replyTo?: { email: string };
    headers?: Record<string, string>;
  };
}

export const fakeEmails = {
  url: `http://localhost:${FAKE_EMAIL_PORT}`,
  async list(): Promise<FakeEmailRecord[]> {
    const res = await fetch(`${this.url}/emails`);
    return (await res.json()) as FakeEmailRecord[];
  },
  async clear(): Promise<void> {
    await fetch(`${this.url}/emails`, { method: 'DELETE' });
  },
  async to(email: string): Promise<FakeEmailRecord[]> {
    return (await this.list()).filter((e) => e.body.to?.some((t) => t.email === email));
  },
};

/** El proyecto sin JavaScript. */
export const isNoJs = (projectName: string) => projectName === 'no-js';

// ---------- Cuentas (feature 002) ----------

/** Inicia sesión inyectando la cookie pc_session de una sesión creada en la base de datos. */
export async function loginAs(page: Page, customer: Pick<TestCustomer, 'id'>, remember = false, now?: Date): Promise<void> {
  // `now`: con la hora del servidor fijada (x-test-now), la sesión tiene que ser vigente a esa hora.
  const token = await createSessionFor(customer.id, remember, now);
  await page.context().addCookies([
    { name: 'pc_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax', secure: false },
  ]);
}

/**
 * Crea una cuenta verificada (con rol de administrador si `admin`) e inicia sesión con ella
 * (feature 007). Devuelve la cuenta.
 */
export async function loginAsNew(page: Page, options: { admin?: boolean; now?: Date } = {}): Promise<TestCustomer> {
  const customer = await createCustomer({ admin: options.admin ?? false });
  await loginAs(page, customer, false, options.now);
  return customer;
}

export type AccountEmailKind =
  | 'verify_email'
  | 'account_exists'
  | 'password_reset'
  | 'password_changed'
  | 'account_deleted'
  /** Boletín (feature 006). */
  | 'newsletter_confirm';

// Cada correo de cuenta se reconoce por el principio de su asunto (contracts/emails.md).
const SUBJECTS: Record<AccountEmailKind, RegExp> = {
  verify_email: /^Confirma tu correo/,
  account_exists: /^Ya tienes una cuenta/,
  password_reset: /^Restablece tu contraseña/,
  password_changed: /^Tu contraseña de .* ha cambiado/,
  account_deleted: /^Hemos eliminado tu cuenta/,
  newsletter_confirm: /^Confirma tu suscripción al boletín/,
};

/**
 * Último correo de un tipo enviado a una dirección. Los correos de cuenta se envían justo después de
 * responder (after()), así que se espera hasta `timeoutMs`.
 */
export async function latestEmailTo(address: string, kind: AccountEmailKind, timeoutMs = 10_000): Promise<FakeEmailRecord> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await fakeEmails.to(address)).filter((e) => SUBJECTS[kind].test(e.body.subject ?? ''));
    if (found.length > 0) return found[found.length - 1]!;
    if (Date.now() > deadline) throw new Error(`No ha llegado ningún correo "${kind}" a ${address}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Cuántos correos de un tipo ha recibido una dirección (sin esperar). */
export async function countEmailsTo(address: string, kind: AccountEmailKind): Promise<number> {
  return (await fakeEmails.to(address)).filter((e) => SUBJECTS[kind].test(e.body.subject ?? '')).length;
}

/** Primer enlace de la web en el texto del correo, como ruta relativa (para page.goto). */
export function extractLink(email: FakeEmailRecord): string {
  const text = email.body.textContent ?? '';
  const match = text.match(/https?:\/\/[^/\s]+(\/[^\s]*token=[A-Za-z0-9_-]+)/);
  if (!match) throw new Error('El correo no tiene ningún enlace con token');
  return match[1]!;
}

/** Enlace del correo a una ruta (p. ej. "/boletin/baja"), como ruta relativa con su ?t=. */
export function linkTo(email: FakeEmailRecord, path: string): string {
  for (const word of (email.body.textContent ?? '').split(/\s+/)) {
    if (!/^https?:\/\//.test(word)) continue;
    const url = new URL(word);
    if (url.pathname === path && url.searchParams.has('t')) return `${url.pathname}${url.search}`;
  }
  throw new Error(`El correo no tiene ningún enlace a ${path}`);
}

// ---------- Citas (feature 003) ----------

/** Hora fija de las pruebas de reserva: lunes laborable 16/11/2026 a las 09:00 en Madrid. */
export const BOOKING_NOW = '2026-11-16T08:00:00.000Z';

/** Fija la hora del servidor (x-test-now, R17) en todas las peticiones de la página. */
export async function setTestNow(page: Page, iso: string = BOOKING_NOW): Promise<void> {
  await page.context().setExtraHTTPHeaders({ 'x-test-now': iso });
}

export const test = base.extend<{ bookingClock: string }>({
  bookingClock: async ({ page }, provide) => {
    await setTestNow(page, BOOKING_NOW);
    await provide(BOOKING_NOW);
  },
});
export { expect };
