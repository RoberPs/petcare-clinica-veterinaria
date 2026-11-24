import { query, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, loginAsNew, test } from './fixtures';

// US4 (feature 008): sumar a un producto agotado (vuelve a estar "En stock"), restar más de lo
// disponible (aviso con el máximo) e historial de movimientos. También sin JavaScript.

const SLUG = 'pelota-caucho-flotante';
let originalStock = 0;

test.describe('008 · US4: ajustar el stock', () => {
  test.beforeAll(async () => {
    originalStock = (await query<{ stock: number }>('SELECT stock FROM products WHERE slug = $1', [SLUG]))[0]!.stock;
  });
  test.beforeEach(async () => {
    await resetAccountState();
    await resetShopState();
    await query('UPDATE products SET stock = 0 WHERE slug = $1', [SLUG]);
  });
  // content:load ya no restaura el stock (G13): se deja como estaba.
  test.afterAll(async () => {
    await query('UPDATE products SET stock = $2 WHERE slug = $1', [SLUG, originalStock]);
  });

  test('ajuste, aviso de stock insuficiente e historial', async ({ page }, testInfo) => {
    const [p] = await query<{ id: string; name: string }>('SELECT id, name FROM products WHERE slug = $1', [SLUG]);
    await loginAsNew(page, { admin: true });
    await page.goto(`/productos/${SLUG}`);
    await dismissCookies(page);
    await expect(page.getByText('Agotado').first()).toBeVisible();

    await page.goto(`/admin/productos/${p!.id}`);
    await page.getByRole('link', { name: 'Ajustar el stock' }).click();
    await expect(page.getByRole('heading', { name: `Stock: ${p!.name}` })).toBeVisible();
    await axeCheck(page);

    if (!isNoJs(testInfo.project.name)) {
      // "Otro" sin nota: error junto al campo.
      await page.getByLabel('Cantidad').fill('4');
      await page.getByLabel('Motivo').selectOption({ label: 'Otro' });
      await page.getByRole('button', { name: 'Ajustar el stock' }).click();
      await expect(page.locator('#note-error')).toContainText('explica el ajuste');
      await axeCheck(page);
      await page.getByLabel('Motivo').selectOption({ label: 'Reposición' });
    }
    await page.getByLabel('Cantidad').fill('4');
    await page.getByRole('button', { name: 'Ajustar el stock' }).click();
    await expect(page.getByRole('status')).toContainText('Stock ajustado');
    await expect(page.locator('.stock-summary')).toContainText('Disponible4');

    await page.getByLabel('Cantidad').fill('-9');
    await page.getByLabel('Motivo').selectOption({ label: 'Rotura o merma' });
    await page.getByRole('button', { name: 'Ajustar el stock' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No hay unidades suficientes' })).toContainText('Como mucho puedes restar 4 unidades');
    await axeCheck(page);

    const history = page.getByRole('table', { name: /movimientos? de stock/ });
    await expect(history.getByRole('row').nth(1)).toContainText('+4');
    await expect(history.getByRole('row').nth(1)).toContainText('Reposición');

    await page.goto(`/productos/${SLUG}`);
    await expect(page.getByText(/^En stock/)).toBeVisible();
  });
});
