import { query, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, loginAsNew, test } from './fixtures';

// US6 (feature 008): alta de un código y lista con su estado; desactivar y reactivar. También sin
// JavaScript.

const CODE = 'E2EVERANO10';

async function cleanCode(): Promise<void> {
  await query(`DELETE FROM admin_audit_log WHERE entity_type = 'discount_code'`);
  await query('DELETE FROM discount_codes WHERE code = $1', [CODE]);
}

test.describe('008 · US6: códigos de descuento', () => {
  test.beforeEach(async () => {
    await resetAccountState();
    await resetShopState();
    await cleanCode();
  });
  test.afterEach(cleanCode);

  test('alta, lista con estado y desactivar', async ({ page }, testInfo) => {
    await loginAsNew(page, { admin: true });
    await page.goto('/admin/descuentos');
    await dismissCookies(page);
    await axeCheck(page);
    await page.getByRole('link', { name: 'Nuevo código' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo código de descuento' })).toBeVisible();
    await axeCheck(page);

    if (!isNoJs(testInfo.project.name)) {
      // Código repetido: error junto al campo.
      await page.getByLabel('Código').fill('bienvenida10');
      await page.getByLabel('Valor').fill('10');
      await page.getByRole('button', { name: 'Crear el código' }).click();
      await expect(page.locator('#code-error')).toContainText('Ya existe un código');
      await axeCheck(page);
    }

    await page.getByLabel('Código').fill(CODE.toLowerCase());
    await page.getByLabel('Valor').fill('10');
    await page.getByLabel('Usos máximos').fill('50');
    await page.getByRole('button', { name: 'Crear el código' }).click();
    await expect(page).toHaveURL(/\/admin\/descuentos\?aviso=creado$/);
    await expect(page.getByRole('status')).toContainText('Código de descuento creado');
    const row = page.getByRole('row', { name: new RegExp(CODE) });
    await expect(row).toContainText('10 %');
    await expect(row).toContainText('0 de 50');
    await expect(row).toContainText('Activo');
    await axeCheck(page);

    await row.getByRole('button', { name: `Desactivar ${CODE}` }).click();
    await expect(page.getByRole('status')).toContainText('Código desactivado');
    await expect(page.getByRole('row', { name: new RegExp(CODE) })).toContainText('Desactivado');
    await page.getByRole('row', { name: new RegExp(CODE) }).getByRole('button', { name: `Reactivar ${CODE}` }).click();
    await expect(page.getByRole('row', { name: new RegExp(CODE) })).toContainText('Activo');
  });
});
