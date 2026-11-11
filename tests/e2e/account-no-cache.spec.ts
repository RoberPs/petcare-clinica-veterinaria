import { createCustomer, resetAccountState } from './db';
import { dismissCookies, expect, isNoJs, loginAs, test } from './fixtures';

// FR-013 y SC-004: las páginas de la cuenta no se guardan en caché; "atrás" tras cerrar sesión no
// enseña nada privado, y la cookie dura lo que dice "Recordarme".

const PUBLIC_AUTH = ['/iniciar-sesion', '/crear-cuenta', '/crear-cuenta/revisa-tu-correo', '/verificar-correo', '/recuperar-contrasena', '/recuperar-contrasena/enviado', '/restablecer-contrasena'];
const PRIVATE = ['/mi-cuenta', '/mi-cuenta/mascotas', '/mi-cuenta/mascotas/nueva', '/mi-cuenta/datos', '/mi-cuenta/eliminar-cuenta'];

test.describe('cuenta · caché y cookie de sesión', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('todas las rutas de la cuenta responden con no-store', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'desktop', 'basta con un proyecto: son cabeceras');
    for (const path of PUBLIC_AUTH) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()['cache-control'], path).toContain('no-store');
    }
    const c = await createCustomer();
    await loginAs(page, c);
    for (const path of PRIVATE) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
      expect(res.headers()['cache-control'], path).toContain('no-store');
    }
    // Sin sesión, las privadas redirigen (307) a iniciar sesión, también sin caché.
    const anon = await request.get('/mi-cuenta/mascotas', { maxRedirects: 0 });
    expect(anon.status()).toBe(307);
    expect(anon.headers()['location']).toContain('/iniciar-sesion?return_to=%2Fmi-cuenta%2Fmascotas');
  });

  test('tras cerrar sesión, "atrás" no vuelve a enseñar el área personal', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Lucía' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Lucía' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/\?aviso=sesion-cerrada$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/iniciar-sesion/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Lucía' })).toHaveCount(0);
  });

  test('sin "Recordarme" la cookie es de sesión; con "Recordarme" dura unos 30 días', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name), 'misma cookie en todos los proyectos');
    const c = await createCustomer();
    const loginWith = async (remember: boolean) => {
      await page.context().clearCookies();
      await page.goto('/iniciar-sesion');
      await dismissCookies(page);
      await page.getByLabel('Correo electrónico').fill(c.email);
      await page.getByLabel('Contraseña', { exact: true }).fill(c.password);
      if (remember) await page.getByRole('checkbox', { name: 'Recordarme' }).check();
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await expect(page).toHaveURL(/\/mi-cuenta$/);
      return (await page.context().cookies()).find((k) => k.name === 'pc_session')!;
    };

    const session = await loginWith(false);
    expect(session.expires).toBe(-1);
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe('Lax');

    const remembered = await loginWith(true);
    const days = (remembered.expires * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });
});
