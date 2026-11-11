import { createCustomer, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, extractLink, latestEmailTo, test } from './fixtures';

// US5 · recuperar la contraseña (también sin JavaScript).

const NEW_PASSWORD = 'tortuga lenta pero segura';

test.describe('US5 · recuperar la contraseña', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('flujo completo: pedir el enlace, crear la contraseña nueva y entrar con ella', async ({ page }) => {
    const c = await createCustomer();
    await page.goto('/iniciar-sesion');
    await dismissCookies(page);
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Recuperar la contraseña' })).toBeVisible();
    await axeCheck(page);
    await page.getByLabel('Correo electrónico').fill(c.email);
    await page.getByRole('button', { name: 'Enviar el enlace' }).click();
    await expect(page).toHaveURL(/\/recuperar-contrasena\/enviado$/);
    await expect(page.getByText('Si ese correo tiene una cuenta')).toBeVisible();
    await axeCheck(page);

    const link = extractLink(await latestEmailTo(c.email, 'password_reset'));
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Crea una contraseña nueva' })).toBeVisible();
    await axeCheck(page);
    await page.getByLabel('Nueva contraseña').fill(NEW_PASSWORD);
    await page.getByLabel('Repetir contraseña').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion\?aviso=contrasena-restablecida$/);
    await expect(page.getByRole('status')).toContainText('Tu contraseña ha cambiado');
    await latestEmailTo(c.email, 'password_changed');

    // La anterior ya no vale y la nueva sí.
    await page.getByLabel('Correo electrónico').fill(c.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(c.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.locator('.form-summary')).toContainText('no son correctos');
    await page.getByLabel('Contraseña', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta$/);

    // El mismo enlace ya no sirve.
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'El enlace ha caducado' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute('href', '/recuperar-contrasena');
  });

  test('con un correo sin cuenta se ve la misma página y no llega nada', async ({ page }) => {
    await page.goto('/recuperar-contrasena');
    await dismissCookies(page);
    await page.getByLabel('Correo electrónico').fill('nadie@example.test');
    await page.getByRole('button', { name: 'Enviar el enlace' }).click();
    await expect(page).toHaveURL(/\/recuperar-contrasena\/enviado$/);
  });

  test('un enlace manipulado muestra la página de enlace caducado', async ({ page }) => {
    await page.goto('/restablecer-contrasena?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { level: 1, name: 'El enlace ha caducado' })).toBeVisible();
    await axeCheck(page);
  });
});
