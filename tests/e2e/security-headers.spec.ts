import { dismissCookies, expect, isNoJs, test } from './fixtures';

// CSP con nonce por petición (R14) y ninguna infracción de CSP en la consola.
test.describe('cabeceras de seguridad', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://www.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="es"><title>Mapa</title></html>' }),
    );
  });

  for (const path of ['/', '/la-clinica', '/contacto']) {
    test(`CSP con nonce y sin errores de CSP en ${path}`, async ({ page }, info) => {
      const cspErrors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text());
      });
      const response = await page.goto(path);
      const headers = response!.headers();
      const csp = headers['content-security-policy'] ?? '';
      const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("'strict-dynamic'");
      expect(csp).toContain('frame-src https://www.openstreetmap.org');
      expect(csp).toContain("img-src 'self' data:");
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['permissions-policy']).toContain('camera=()');

      // Cada petición lleva un nonce distinto.
      const second = (await page.request.get(path)).headers()['content-security-policy'];
      expect(second).not.toContain(nonce!);

      if (!isNoJs(info.project.name)) {
        const scriptNonces = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
        expect(scriptNonces.length).toBeGreaterThan(0);
        expect(scriptNonces.every((n) => n === nonce)).toBe(true);
      }
      if (path === '/la-clinica') {
        await dismissCookies(page);
        await page.getByRole('button', { name: 'Aceptar y ver el mapa' }).click();
        await expect(page.locator('iframe[src*="openstreetmap.org"]')).toBeVisible();
      }
      expect(cspErrors).toEqual([]);
    });
  }
});
