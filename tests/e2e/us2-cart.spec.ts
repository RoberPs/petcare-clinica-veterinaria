import type { Page } from '@playwright/test';
import { loadPetcare, query, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, test } from './fixtures';

// US2 (feature 005) · revisar el carrito: líneas, cantidades, eliminar, resumen y avisos por línea.

async function add(page: Page, slug: string, quantity = 1) {
  await page.goto(`/productos/${slug}`);
  await dismissCookies(page);
  await page.getByLabel('Cantidad').fill(String(quantity));
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await expect(page).toHaveURL(/aviso=carrito-/);
}

const eur = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;

test.describe('US2 · revisar el carrito', () => {
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async () => {
    await resetShopState();
    await query(`UPDATE products SET stock = 14 WHERE slug = 'pienso-perro-adulto'`);
    await query(`UPDATE products SET stock = 18 WHERE slug = 'champu-piel-sensible'`);
  });
  test.afterAll(async () => {
    await loadPetcare();
  });

  test('estado vacío sin "Finalizar compra" y con enlace a la tienda', async ({ page }) => {
    await page.goto('/carrito');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Tu carrito' })).toBeVisible();
    await expect(page.getByText('Tu carrito está vacío.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Finalizar compra' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ver productos' })).toHaveAttribute('href', '/productos');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await axeCheck(page);
  });

  test('líneas, resumen, cambiar la cantidad y eliminar (también sin JavaScript)', async ({ page }) => {
    await add(page, 'pienso-perro-adulto', 1);
    await add(page, 'champu-piel-sensible', 1);
    const [pienso] = await query<{ name: string; price_cents: number }>(`SELECT name, price_cents FROM products WHERE slug = 'pienso-perro-adulto'`);
    const [champu] = await query<{ name: string; price_cents: number }>(`SELECT name, price_cents FROM products WHERE slug = 'champu-piel-sensible'`);

    await page.goto('/carrito');
    const items = page.locator('article.cart-item');
    await expect(items).toHaveCount(2);
    await expect(items.first().getByRole('link', { name: pienso!.name })).toBeVisible();
    await expect(items.first().getByText(/^Alimentación · /)).toBeVisible();
    const summary = page.getByRole('complementary', { name: 'Resumen del pedido' });
    await expect(summary).toContainText('Gratis');
    await expect(summary).toContainText(eur(pienso!.price_cents + champu!.price_cents));
    await expect(summary).toContainText('IVA incluido');
    await axeCheck(page);

    await page.getByLabel(`Cantidad de ${pienso!.name}`).fill('3');
    await page.getByRole('button', { name: `Actualizar la cantidad de ${pienso!.name}` }).click();
    await expect(page).toHaveURL(/\/carrito\?aviso=carrito-actualizado$/);
    await expect(summary).toContainText(eur(pienso!.price_cents * 3 + champu!.price_cents));

    await page.getByRole('button', { name: `Eliminar ${champu!.name}` }).click();
    await expect(page.locator('article.cart-item')).toHaveCount(1);
    await expect(summary).toContainText(eur(pienso!.price_cents * 3));

    await page.getByRole('link', { name: '← Seguir comprando' }).click();
    await expect(page).toHaveURL(/\/productos$/);
  });

  test('avisos por línea: precio cambiado, stock menor y producto no disponible', async ({ page }) => {
    await add(page, 'pienso-perro-adulto', 5);
    await add(page, 'champu-piel-sensible', 1);
    await add(page, 'pelota-caucho-flotante', 1);
    await query(`UPDATE products SET stock = 2 WHERE slug = 'pienso-perro-adulto'`);
    await query(`UPDATE products SET price_cents = price_cents + 100 WHERE slug = 'pelota-caucho-flotante'`);
    await query(`UPDATE products SET published = false WHERE slug = 'champu-piel-sensible'`);
    try {
      await page.goto('/carrito');
      await expect(page.getByText('Solo quedan 2 unidades')).toBeVisible();
      await expect(page.getByText(/El precio ha cambiado: antes .*, ahora/)).toBeVisible();
      await expect(page.getByText('Este producto ya no está disponible')).toBeVisible();
      await expect(page.getByText('No disponible', { exact: true })).toBeVisible();
      await axeCheck(page);
    } finally {
      await query(`UPDATE products SET price_cents = price_cents - 100 WHERE slug = 'pelota-caucho-flotante'`);
      await query(`UPDATE products SET published = true WHERE slug = 'champu-piel-sensible'`);
    }
  });
});
