import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';
import { FAKE_EMAIL_PORT } from '../test-env';

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
  body: { to?: { email: string }[]; subject?: string; textContent?: string; htmlContent?: string; replyTo?: { email: string } };
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

export const test = base;
export { expect };
