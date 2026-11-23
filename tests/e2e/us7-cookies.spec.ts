import { createHmac } from 'node:crypto';
import { testEnv } from '../test-env';
import { axeCheck, expect, isNoJs, test } from './fixtures';

const ROUTES = ['/', '/la-clinica', '/contacto', '/tratamientos', '/preguntas-frecuentes'];

function signedConsent(v: string, thirdParty: boolean): string {
  const body = Buffer.from(JSON.stringify({ v, third_party: thirdParty, at: new Date().toISOString() })).toString('base64url');
  return `${body}.${createHmac('sha256', testEnv.FORM_SECRET!).update(body).digest('base64url')}`;
}

test.describe('US7 · cookies', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://www.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="es"><title>Mapa</title></html>' }),
    );
  });

  test('primera visita: aviso con dos botones iguales y enlace a la política', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('region', { name: 'Aviso de cookies' });
    await expect(banner).toBeVisible();
    const accept = await banner.getByRole('button', { name: 'Aceptar' }).boundingBox();
    const reject = await banner.getByRole('button', { name: 'Rechazar' }).boundingBox();
    expect(Math.round(accept!.width)).toBe(Math.round(reject!.width));
    expect(Math.round(accept!.height)).toBe(Math.round(reject!.height));
    await expect(banner.getByRole('link', { name: 'Política de cookies' })).toHaveAttribute('href', '/politica-de-cookies');
    await axeCheck(page);
  });

  test('"Rechazar" quita el aviso, no vuelve y no hay peticiones a terceros', async ({ page }) => {
    const thirdParty: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(testEnv.SITE_URL!)) thirdParty.push(r.url());
    });
    await page.goto('/');
    const banner = page.getByRole('region', { name: 'Aviso de cookies' });
    await banner.getByRole('button', { name: 'Rechazar' }).click();
    await expect(banner).toBeHidden();
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toHaveCount(0);
    }
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(thirdParty).toEqual([]);
  });

  test('"Aceptar" carga el mapa (con JavaScript, sin recargar)', async ({ page }, info) => {
    await page.goto('/la-clinica');
    await expect(page.locator('iframe')).toHaveCount(0);
    if (!isNoJs(info.project.name)) await page.evaluate(() => ((window as unknown as { __sinRecarga: boolean }).__sinRecarga = true));
    await page.getByRole('region', { name: 'Aviso de cookies' }).getByRole('button', { name: 'Aceptar' }).click();
    await expect(page.locator('iframe[src*="openstreetmap.org"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toHaveCount(0);
    if (!isNoJs(info.project.name)) {
      expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
    }
  });

  test('desde /cookies/configurar se puede retirar y el mapa desaparece', async ({ page }) => {
    await page.goto('/la-clinica');
    await page.getByRole('region', { name: 'Aviso de cookies' }).getByRole('button', { name: 'Aceptar' }).click();
    await expect(page.locator('iframe[src*="openstreetmap.org"]')).toBeVisible();
    await page.getByRole('contentinfo').getByRole('link', { name: 'Configurar cookies' }).click();
    await expect(page.getByRole('status')).toContainText('Has aceptado');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.getByRole('main').getByRole('button', { name: 'Rechazar' }).click();
    await expect(page.getByRole('status')).toContainText('Has rechazado');
    await axeCheck(page);
    await page.goto('/la-clinica');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('.map-placeholder')).toBeVisible();
  });

  test('con otra versión de la política se vuelve a preguntar; una firma falsa no vale', async ({ page, context }) => {
    const base = { domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' as const };
    await context.addCookies([{ name: 'pc_consent', value: signedConsent('0', true), ...base }]);
    await page.goto('/la-clinica');
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);

    await context.addCookies([{ name: 'pc_consent', value: `${signedConsent('1', true).slice(0, -3)}abc`, ...base }]);
    await page.goto('/la-clinica');
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toBeVisible();

    await context.addCookies([{ name: 'pc_consent', value: signedConsent('1', true), ...base }]);
    await page.goto('/la-clinica');
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toHaveCount(0);
    await expect(page.locator('iframe[src*="openstreetmap.org"]')).toBeVisible();
  });

  test('POST /api/consent desde otro origen da 403', async ({ request }) => {
    const res = await request.post('/api/consent', {
      form: { choice: 'accept' },
      headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
  });
});
