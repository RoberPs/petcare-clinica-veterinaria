import { readFileSync } from 'node:fs';
import { createCustomer, createPet, query, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, latestEmailTo, loginAs, test } from './fixtures';

// US7 · descargar mis datos y eliminar mi cuenta (también sin JavaScript).

test.describe('US7 · descarga y eliminación', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('"Descargar mis datos" baja un JSON con Content-Disposition', async ({ page }, info) => {
    const c = await createCustomer({ firstName: 'Lucía' });
    await createPet(c.id, { name: 'Bruno', speciesKey: 'perro' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta/datos');
    await dismissCookies(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar mis datos' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^mis-datos-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(readFileSync((await file.path())!, 'utf8'));
    expect(data).toMatchObject({ format_version: 1, account: { email: c.email, first_name: 'Lucía' } });
    expect(data.pets).toEqual([expect.objectContaining({ name: 'Bruno', species: 'Perro' })]);
    if (!isNoJs(info.project.name)) await expect(page).toHaveURL(/\/mi-cuenta\/datos$/);
  });

  test('eliminar la cuenta con la contraseña: portada con el aviso, sin acceso y correo de confirmación', async ({ page }) => {
    const c = await createCustomer();
    await createPet(c.id);
    await loginAs(page, c);
    await page.goto('/mi-cuenta/datos');
    await dismissCookies(page);
    await page.getByRole('link', { name: 'Eliminar mi cuenta' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/eliminar-cuenta$/);
    await expect(page.getByText('No se puede deshacer.')).toBeVisible();
    await axeCheck(page);

    await page.getByLabel('Escribe tu contraseña para confirmar').fill('no es la mía');
    await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(page.locator('#current_password-error')).toHaveText('La contraseña actual no es correcta.');
    expect(await query('SELECT id FROM customers WHERE id = $1', [c.id])).toHaveLength(1);

    await page.getByLabel('Escribe tu contraseña para confirmar').fill(c.password);
    await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(page).toHaveURL(/\/\?aviso=cuenta-eliminada$/);
    await expect(page.getByRole('status')).toContainText('Hemos eliminado tu cuenta');
    expect(await query('SELECT id FROM customers WHERE id = $1', [c.id])).toEqual([]);
    await latestEmailTo(c.email, 'account_deleted');

    await page.goto('/mi-cuenta');
    await expect(page).toHaveURL(/\/iniciar-sesion/);
    await page.getByLabel('Correo electrónico').fill(c.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(c.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.locator('.form-summary')).toContainText('El correo o la contraseña no son correctos.');
  });
});
