import type { Page } from '@playwright/test';
import { createCustomer, query, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, latestEmailTo, test } from './fixtures';

// US2 · iniciar y cerrar sesión con "Recordarme" (también sin JavaScript).

async function fillLogin(page: Page, email: string, password: string, remember = false) {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  if (remember) await page.getByRole('checkbox', { name: 'Recordarme' }).check();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test.describe('US2 · iniciar y cerrar sesión', () => {
  test.beforeEach(async ({ page }) => {
    await resetAccountState();
    await page.goto('/iniciar-sesion');
    await dismissCookies(page);
  });

  test('la página es accesible y enlaza a recuperar la contraseña y a crear cuenta', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute('href', '/recuperar-contrasena');
    await expect(page.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/crear-cuenta');
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await axeCheck(page);
  });

  test('error genérico con la contraseña incorrecta y con un correo que no existe', async ({ page }) => {
    const c = await createCustomer();
    await fillLogin(page, c.email, 'no es la contraseña');
    await expect(page.locator('.form-summary')).toContainText('El correo o la contraseña no son correctos.');
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(c.email);
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
    await fillLogin(page, 'nadie@example.test', 'no es la contraseña');
    await expect(page.locator('.form-summary')).toContainText('El correo o la contraseña no son correctos.');
    await axeCheck(page);
  });

  test('cuenta sin verificar: aviso con el botón de reenvío', async ({ page }) => {
    const c = await createCustomer({ verified: false });
    await fillLogin(page, c.email, c.password);
    await expect(page.locator('.form-summary')).toContainText('confirmar tu correo');
    await page.getByRole('button', { name: 'Reenviar el enlace' }).click();
    await expect(page).toHaveURL(/\/crear-cuenta\/revisa-tu-correo\?aviso=enlace-reenviado$/);
    await latestEmailTo(c.email, 'verify_email');
  });

  test('bloqueo tras 5 fallos con los minutos de espera', async ({ page }) => {
    const c = await createCustomer();
    for (let i = 0; i < 5; i++) {
      await fillLogin(page, c.email, `mala ${i}`);
      // Tras cada envío el campo de la contraseña se vacía: así se sabe que la respuesta ha llegado.
      await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
      await expect(page.locator('.form-summary')).toContainText('no son correctos');
    }
    await fillLogin(page, c.email, c.password);
    await expect(page.locator('.form-summary')).toContainText(/Vuelve a intentarlo en \d+ minutos/);
  });

  test('"Mi cuenta" sin sesión lleva a iniciar sesión y, tras entrar, vuelve a la página pedida', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Lucía' });
    await page.goto('/mi-cuenta/datos');
    await expect(page).toHaveURL(/\/iniciar-sesion\?return_to=%2Fmi-cuenta%2Fdatos$/);
    await fillLogin(page, c.email, c.password);
    await expect(page).toHaveURL(/\/mi-cuenta\/datos$/);
  });

  test('"Mi cuenta" de la cabecera lleva al resumen con sesión, y "Cerrar sesión" a la portada', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Lucía' });
    await fillLogin(page, c.email, c.password, true);
    await expect(page).toHaveURL(/\/mi-cuenta$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Lucía' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Mi cuenta' }).getByRole('link', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
    await axeCheck(page);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/\?aviso=sesion-cerrada$/);
    await expect(page.getByRole('status')).toContainText('Has cerrado la sesión.');
    expect(await query('SELECT token_hash FROM customer_sessions WHERE customer_id = $1', [c.id])).toEqual([]);
    await page.goto('/mi-cuenta');
    await expect(page).toHaveURL(/\/iniciar-sesion/);
  });

  test('con sesión, /iniciar-sesion y /crear-cuenta llevan al área personal', async ({ page }) => {
    const c = await createCustomer();
    await fillLogin(page, c.email, c.password);
    await expect(page).toHaveURL(/\/mi-cuenta$/);
    await page.goto('/iniciar-sesion');
    await expect(page).toHaveURL(/\/mi-cuenta$/);
    await page.goto('/crear-cuenta');
    await expect(page).toHaveURL(/\/mi-cuenta$/);
  });
});
