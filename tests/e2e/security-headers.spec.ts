import { createAppointmentInDb, createCustomer, madrid, resetAccountState, resetBookingState } from './db';
import { dismissCookies, expect, isNoJs, loginAs, test } from './fixtures';

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
      // Con la pasarela simulada (PAYMENT_PROVIDER=fake) form-action se queda en 'self' (D14).
      expect(csp).toContain("form-action 'self';");
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

// Feature 002: cuenta y autenticación.
test.describe('cabeceras de seguridad de la cuenta', () => {
  const PUBLIC = ['/crear-cuenta', '/iniciar-sesion', '/recuperar-contrasena', '/verificar-correo', '/restablecer-contrasena'];
  const PRIVATE = ['/mi-cuenta', '/mi-cuenta/mascotas', '/mi-cuenta/datos'];

  test('no-store, noindex y CSP con nonce en las rutas de la cuenta', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'son cabeceras: basta con un proyecto');
    await resetAccountState();
    const c = await createCustomer();
    const check = async (path: string) => {
      const response = await page.goto(path);
      const headers = response!.headers();
      expect(headers['cache-control'], path).toContain('no-store');
      expect(headers['content-security-policy'], path).toMatch(/'nonce-[^']+'/);
      expect(headers['x-frame-options'], path).toBe('DENY');
      await expect(page.locator('meta[name="robots"]').first(), path).toHaveAttribute('content', /noindex/);
    };
    for (const path of PUBLIC) await check(path);
    await loginAs(page, c);
    for (const path of PRIVATE) await check(path);
    const robots = await (await page.request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /mi-cuenta');
  });

  // Feature 003: la confirmación, "Mis citas" y el enlace de gestión (contracts/routes.md).
  test('no-store y noindex en la confirmación, Mis citas y el enlace de gestión', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'son cabeceras: basta con un proyecto');
    await resetAccountState();
    await resetBookingState();
    const c = await createCustomer();
    const appt = await createAppointmentInDb({ customerId: c.id, startsAt: madrid('2026-12-21', '10:00') });
    const check = async (path: string) => {
      const response = await page.goto(path);
      const headers = response!.headers();
      expect(headers['cache-control'], path).toContain('no-store');
      expect(headers['content-security-policy'], path).toMatch(/'nonce-[^']+'/);
      await expect(page.locator('meta[name="robots"]').first(), path).toHaveAttribute('content', /noindex/);
      return headers;
    };
    await check('/pide-cita/confirmada');
    const manage = await check('/gestion-cita/token-de-prueba.no-valido');
    expect(manage['x-robots-tag']).toContain('noindex');
    expect(manage['referrer-policy']).toBe('same-origin');
    await loginAs(page, c);
    for (const path of ['/mi-cuenta/citas', `/mi-cuenta/citas/${appt.id}/cancelar`, `/mi-cuenta/citas/${appt.id}/cambiar`]) await check(path);
    // Los pasos 1 y 2 de /pide-cita son indexables, pero tampoco se guardan en caché.
    const booking = await page.goto('/pide-cita');
    expect(booking!.headers()['cache-control']).toContain('no-store');
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test('la cookie pc_session es HttpOnly, SameSite=Lax y Path=/ (Secure solo con https)', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'basta con un proyecto');
    await resetAccountState();
    const c = await createCustomer();
    await page.goto('/iniciar-sesion');
    await dismissCookies(page);
    await page.getByLabel('Correo electrónico').fill(c.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(c.password);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/iniciar-sesion')),
      page.getByRole('button', { name: 'Iniciar sesión' }).click(),
    ]);
    const setCookie = (await response.headerValue('set-cookie')) ?? '';
    const session = setCookie.split('\n').find((line) => line.startsWith('pc_session='))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=lax/i);
    expect(session).toMatch(/Path=\//);
    // En las pruebas la web va por http://localhost: sin Secure (el navegador no la guardaría).
    // En producción SITE_URL es https y la cookie lleva Secure (cookieIsSecure()).
    expect(session).not.toMatch(/;\s*Secure/i);
    await expect(page).toHaveURL(/\/mi-cuenta$/);
  });
});

