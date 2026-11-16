import type { Page } from '@playwright/test';
import { createCustomer, loadPetcare, query, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, test } from './fixtures';

// US1 (feature 005) · añadir productos al carrito, contador de la cabecera y unión al iniciar sesión.

const cartLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^Carrito, \d+ productos?$/ });

async function productName(slug: string): Promise<string> {
  const [row] = await query<{ name: string }>('SELECT name FROM products WHERE slug = $1', [slug]);
  return row!.name;
}

test.describe('US1 · añadir al carrito', () => {
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async () => {
    await resetShopState();
    await query(`UPDATE products SET stock = 14 WHERE slug = 'pienso-perro-adulto'`);
  });
  test.afterAll(async () => {
    await loadPetcare();
  });

  test('"Añadir" en el listado conserva los filtros y anuncia "Añadido al carrito"', async ({ page }) => {
    await page.goto('/productos?mascota=perro&orden=precio-asc');
    await dismissCookies(page);
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 0 productos');
    const card = page.locator('article.product').first();
    const name = await card.locator('h3').innerText();
    await card.getByRole('button', { name: `Añadir ${name} al carrito` }).click();
    await expect(page).toHaveURL(/\/productos\?mascota=perro&orden=precio-asc&aviso=carrito-anadido$/);
    await expect(page.getByRole('status').filter({ hasText: 'Añadido al carrito.' })).toBeVisible();
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 1 producto');
    await axeCheck(page);
  });

  test('la tarjeta enlaza a la ficha con el título', async ({ page }) => {
    await page.goto('/productos');
    await dismissCookies(page);
    const name = await productName('pienso-perro-adulto');
    await page.getByRole('link', { name, exact: true }).first().click();
    await expect(page).toHaveURL(/\/productos\/pienso-perro-adulto$/);
  });

  test('uno desde el listado y 2 desde la ficha: contador en 3 tras recargar', async ({ page }) => {
    await page.goto('/productos');
    await dismissCookies(page);
    const pienso = await productName('pienso-perro-adulto');
    await page.getByRole('button', { name: `Añadir ${pienso} al carrito` }).click();
    await expect(page).toHaveURL(/aviso=carrito-anadido/);
    await page.goto('/productos/champu-piel-sensible');
    await page.getByLabel('Cantidad').fill('2');
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await expect(page).toHaveURL(/\/productos\/champu-piel-sensible\?aviso=carrito-anadido$/);
    await page.reload();
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 3 productos');
    await axeCheck(page);
  });

  test('cantidad por encima del stock: "Solo quedan N unidades"', async ({ page }) => {
    await query(`UPDATE products SET stock = 3 WHERE slug = 'pienso-perro-adulto'`);
    await page.goto('/productos/pienso-perro-adulto');
    await dismissCookies(page);
    await expect(page.getByLabel('Cantidad')).toHaveAttribute('max', '3');
    await page.getByLabel('Cantidad').fill('3');
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await page.getByLabel('Cantidad').fill('2');
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solo quedan 3 unidades');
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 3 productos');
  });

  test('un producto agotado no tiene acciones de compra', async ({ page }) => {
    await query(`UPDATE products SET stock = 0 WHERE slug = 'pienso-perro-adulto'`);
    await page.goto('/productos/pienso-perro-adulto');
    await expect(page.getByRole('button', { name: 'Añadir al carrito', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Cantidad')).toHaveCount(0);
    // Los agotados van al final del orden destacado: se busca por nombre.
    await page.goto('/productos?q=pienso+de+pollo');
    const name = await productName('pienso-perro-adulto');
    const card = page.locator('article.product').filter({ hasText: name });
    await expect(card.getByText('Agotado')).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
  });

  test('al iniciar sesión se unen el carrito de invitado y el de la cuenta', async ({ page }) => {
    const c = await createCustomer();
    await page.goto('/productos/pienso-perro-adulto');
    await dismissCookies(page);
    await page.getByLabel('Cantidad').fill('2');
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos');
    expect((await page.context().cookies()).some((k) => k.name === 'pc_cart' && k.httpOnly)).toBe(true);

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(c.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(c.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta/);
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos');
    expect((await page.context().cookies()).some((k) => k.name === 'pc_cart' && k.value !== '')).toBe(false);
    const rows = await query('SELECT customer_id FROM carts');
    expect(rows).toEqual([{ customer_id: c.id }]);
  });
});
