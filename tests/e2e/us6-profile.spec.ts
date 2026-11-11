import { createCustomer, createSessionFor, query, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, latestEmailTo, loginAs, test } from './fixtures';

// US6 · editar mis datos personales (también sin JavaScript).

const NEW_PASSWORD = 'tortuga lenta pero segura';

test.describe('US6 · datos personales', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('guardar los datos y ver el saludo nuevo en el resumen', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Lucía' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta/datos');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Datos personales' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Mi cuenta' }).getByRole('link', { name: 'Datos personales' })).toHaveAttribute('aria-current', 'page');
    const email = page.getByLabel('Correo de la cuenta');
    await expect(email).toHaveValue(c.email);
    await expect(email).toHaveAttribute('readonly', '');
    await axeCheck(page);

    await page.getByLabel('Nombre', { exact: true }).fill('Lucía María');
    await page.getByLabel('Teléfono').fill('600 123 456');
    await page.getByLabel('Dirección').fill('Calle Mayor 1, 2.º B');
    await page.getByLabel('Código postal').fill('28001');
    await page.getByLabel('Localidad').fill('Madrid');
    await page.getByRole('button', { name: 'Guardar mis datos' }).click();
    await expect(page).toHaveURL(/aviso=datos-guardados$/);
    await expect(page.getByRole('status')).toContainText('Hemos guardado tus datos.');
    await expect(page.getByLabel('Teléfono')).toHaveValue('600 123 456');

    await page.getByRole('navigation', { name: 'Mi cuenta' }).getByRole('link', { name: 'Resumen' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Lucía María' })).toBeVisible();
    expect(await query('SELECT city, postal_code FROM customers WHERE id = $1', [c.id])).toEqual([{ city: 'Madrid', postal_code: '28001' }]);
  });

  test('errores junto al campo y nada guardado', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Lucía' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta/datos');
    await dismissCookies(page);
    await page.getByLabel('Código postal').fill('2800');
    await page.getByRole('button', { name: 'Guardar mis datos' }).click();
    await expect(page.locator('#postal_code-error')).toHaveText('Escribe un código postal de 5 cifras.');
    await expect(page.getByLabel('Código postal')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#city-error')).toHaveText('Escribe también la localidad.');
    expect(await query('SELECT postal_code FROM customers WHERE id = $1', [c.id])).toEqual([{ postal_code: null }]);
    await axeCheck(page);
  });

  test('cambiar la contraseña: aviso, otras sesiones cerradas y correo de aviso', async ({ page }) => {
    const c = await createCustomer();
    await createSessionFor(c.id, true); // otro dispositivo
    await loginAs(page, c);
    await page.goto('/mi-cuenta/datos');
    await dismissCookies(page);

    await page.getByLabel('Contraseña actual').fill('no es la mía');
    await page.getByLabel('Nueva contraseña').fill(NEW_PASSWORD);
    await page.getByLabel('Repetir contraseña').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
    await expect(page.locator('#current_password-error')).toHaveText('La contraseña actual no es correcta.');

    await page.getByLabel('Contraseña actual').fill(c.password);
    await page.getByLabel('Nueva contraseña').fill(NEW_PASSWORD);
    await page.getByLabel('Repetir contraseña').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
    await expect(page).toHaveURL(/aviso=contrasena-cambiada$/);
    await expect(page.getByRole('status')).toContainText('Hemos cambiado tu contraseña');
    expect(await query('SELECT count(*)::int AS n FROM customer_sessions WHERE customer_id = $1', [c.id])).toEqual([{ n: 1 }]);
    await latestEmailTo(c.email, 'password_changed');
  });
});
