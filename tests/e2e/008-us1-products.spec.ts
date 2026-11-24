import sharp from 'sharp';
import { query, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, loginAsNew, test } from './fixtures';

// US1 (feature 008): alta de un producto con foto y «Novedad», cambio de precio visto en el
// carrito, desactivar (no disponible y 404) y reactivar. También sin JavaScript.

const NAME = 'Comedero Antivoracidad E2E';
const SLUG = 'comedero-antivoracidad-e2e';

async function cleanProduct(): Promise<void> {
  await query(`DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE slug LIKE '${SLUG}%')`);
  await query(`DELETE FROM admin_audit_log WHERE entity_type = 'product'`);
  await query(`DELETE FROM products WHERE slug LIKE '${SLUG}%'`);
}

test.describe('008 · US1: productos desde el panel', () => {
  test.beforeEach(async () => {
    await resetAccountState();
    await resetShopState();
    await cleanProduct();
  });
  test.afterEach(cleanProduct);

  test('alta con foto, precio nuevo en el carrito, desactivar y reactivar', async ({ page }, testInfo) => {
    const noJs = isNoJs(testInfo.project.name);
    const photo = await sharp({ create: { width: 900, height: 900, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
    await loginAsNew(page, { admin: true });

    await page.goto('/admin/productos');
    await dismissCookies(page);
    await axeCheck(page);
    await page.getByRole('link', { name: 'Nuevo producto' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible();
    await axeCheck(page);

    // Primer envío sin mascota: vuelve con el error junto al campo y el aviso de volver a elegir la foto.
    await page.getByLabel('Nombre', { exact: true }).fill(NAME);
    await page.getByLabel('Descripción corta').fill('Comedero que obliga a comer despacio.');
    await page.getByLabel('Descripción', { exact: true }).fill('Comedero con laberinto interior que reduce la velocidad al comer.');
    await page.getByLabel('Categoría').selectOption({ index: 1 });
    await page.getByLabel('Precio en euros (IVA incluido)').fill('14,90');
    await page.getByLabel('Stock inicial').fill('6');
    await page.getByLabel('Novedad').check();
    await page.getByLabel('Foto del producto').setInputFiles({ name: 'comedero.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.getByLabel('Texto alternativo de la foto').fill('Comedero naranja con laberinto');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page.getByRole('alert').first()).toContainText('Elige al menos una mascota');
    await expect(page.getByText('vuelve a elegirla')).toBeVisible();
    await axeCheck(page);

    const pets = page.getByRole('group', { name: 'Mascotas' });
    await pets.getByRole('checkbox').first().check();
    await page.getByLabel('Foto del producto').setInputFiles({ name: 'comedero.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page).toHaveURL(/\/admin\/productos\/[0-9a-f-]{36}\?aviso=guardado$/);
    await expect(page.getByRole('status')).toContainText('Cambios guardados');
    const editUrl = page.url().split('?')[0]!;
    await axeCheck(page);

    // Listado y ficha pública con la foto subida.
    await page.goto('/admin/productos?q=antivoracidad');
    await expect(page.getByRole('link', { name: NAME, exact: true })).toBeVisible();
    await page.goto(`/productos/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
    const img = page.getByRole('img', { name: 'Comedero naranja con laberinto' });
    await expect(img).toHaveAttribute('src', /\/media\/subidas\/productos\/[0-9a-f-]{36}-(480|960|1440)\.webp/);
    if (!noJs) expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    // Al carrito.
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await expect(page).toHaveURL(/aviso=carrito-/);

    // Precio nuevo: el carrito muestra el actual.
    await page.goto(editUrl);
    await page.getByLabel('Precio en euros (IVA incluido)').fill('12,50');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page.getByRole('status')).toContainText('Cambios guardados');
    await page.goto('/carrito');
    await expect(page.locator('.cart-item').filter({ hasText: NAME })).toContainText('12,50');

    // Desactivar: no disponible en el carrito y 404 en la ficha.
    await page.goto(editUrl);
    await page.getByRole('button', { name: 'Desactivar' }).click();
    await expect(page.getByRole('status')).toContainText('Producto desactivado');
    await page.goto('/carrito');
    await expect(page.locator('.cart-item').filter({ hasText: NAME })).toContainText('No disponible');
    const res = await page.goto(`/productos/${SLUG}`);
    expect(res?.status()).toBe(404);

    // Reactivar.
    await page.goto(editUrl);
    await page.getByRole('button', { name: 'Reactivar' }).click();
    await expect(page.getByRole('status')).toContainText('Producto reactivado');
    expect((await page.goto(`/productos/${SLUG}`))?.status()).toBe(200);
  });
});
