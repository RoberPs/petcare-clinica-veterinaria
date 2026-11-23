import { createCustomer, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, loginAs, loginAsNew, test } from './fixtures';

// US1 (feature 007): solo las cuentas verificadas con rol entran en /admin (FR-001 a FR-003, F3).

test.describe('US1: acceso al panel de administración', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('el admin ve el enlace en Mi cuenta y entra en la agenda', async ({ page }) => {
    await loginAsNew(page, { admin: true });
    await page.goto('/mi-cuenta');
    await dismissCookies(page);
    await page.getByRole('navigation', { name: 'Mi cuenta' }).getByRole('link', { name: 'Panel de administración' }).click();
    await expect(page).toHaveURL(/\/admin\/agenda/);
    await expect(page.getByRole('heading', { level: 1, name: 'Panel de administración' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Panel de administración' });
    await expect(nav.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Servicios', 'Veterinarios', 'Bloqueos']) await expect(nav.getByRole('link', { name })).toBeVisible();
    await axeCheck(page);
  });

  test('un cliente sin rol no ve el enlace y recibe el 404 normal', async ({ page }) => {
    await loginAsNew(page);
    await page.goto('/mi-cuenta');
    await dismissCookies(page);
    await expect(page.getByRole('link', { name: 'Panel de administración' })).toHaveCount(0);
    for (const path of ['/admin', '/admin/agenda', '/admin/servicios', '/admin/citas/00000000-0000-4000-8000-000000000000']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: 'No encontramos esta página' })).toBeVisible();
    }
  });

  test('un anónimo va a iniciar sesión y vuelve a la ruta pedida', async ({ page }) => {
    const admin = await createCustomer({ admin: true });
    await page.goto('/admin/servicios');
    await expect(page).toHaveURL(/\/iniciar-sesion\?return_to=%2Fadmin%2Fservicios$/);
    await dismissCookies(page);
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/admin\/servicios$/);
  });

  test('retirar el rol surte efecto en la siguiente petición', async ({ page }) => {
    const admin = await createCustomer({ admin: true });
    await loginAs(page, admin);
    expect((await page.goto('/admin/agenda'))?.status()).toBe(200);
    const { query } = await import('./db');
    await query('UPDATE customers SET is_admin = false WHERE id = $1', [admin.id]);
    expect((await page.goto('/admin/agenda'))?.status()).toBe(404);
  });

  test('cabeceras: sin indexar y sin caché', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'basta con un proyecto: son cabeceras');
    await loginAsNew(page, { admin: true });
    for (const path of ['/admin/agenda', '/admin/servicios']) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.headers()['x-robots-tag'], path).toContain('noindex');
      expect(res.headers()['cache-control'], path).toContain('no-store');
    }
    const anon = await page.context().request.get('/admin/agenda', { maxRedirects: 0, headers: { cookie: '' } });
    expect(anon.headers()['x-robots-tag']).toContain('noindex');
  });

  test('teclado: enlace para saltar al contenido y foco visible en el menú', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name) || info.project.name === 'mobile-360', 'navegación con teclado en escritorio');
    await loginAsNew(page, { admin: true });
    await page.goto('/admin/agenda');
    await dismissCookies(page);
    // Tras cerrar el aviso de cookies, el foco vuelve al principio con una carga nueva.
    await page.reload();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    await page.keyboard.press('Enter');
    const agenda = page.getByRole('navigation', { name: 'Panel de administración' }).getByRole('link', { name: 'Agenda' });
    await agenda.focus();
    await expect(agenda).toBeFocused();
    const outline = await agenda.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });
});
