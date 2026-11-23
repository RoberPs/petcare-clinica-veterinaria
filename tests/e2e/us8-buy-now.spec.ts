import type { Page } from '@playwright/test';
import { loadPetcare, query, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, test } from './fixtures';

// US8 (feature 005) · "Comprar ahora" desde la ficha: checkout solo con ese producto, sin código
// de descuento, y el carrito principal intacto tanto si se completa como si se abandona.

const DIRECT = 'pienso-perro-adulto';
const IN_CART = 'champu-piel-sensible';

async function productName(slug: string): Promise<string> {
  const [p] = await query<{ name: string }>('SELECT name FROM products WHERE slug = $1', [slug]);
  return p!.name;
}

async function fillCheckout(page: Page) {
  await page.getByLabel('Correo electrónico', { exact: true }).fill('comprador-us8@example.test');
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
  await page.getByLabel('Dirección', { exact: true }).fill('Calle de la Prueba 3');
  await page.getByLabel('Código postal', { exact: true }).fill('28001');
  await page.getByLabel('Ciudad', { exact: true }).fill('Madrid');
  await page.waitForTimeout(3_200);
}

async function buyNow(page: Page, quantity: number) {
  await page.goto(`/productos/${DIRECT}`);
  await page.getByLabel('Cantidad').fill(String(quantity));
  await page.getByRole('button', { name: 'Comprar ahora' }).click();
  await expect(page).toHaveURL(/\/finalizar-compra\?directa=1$/);
}

test.describe('US8 · comprar ahora', () => {
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async ({ page }) => {
    await resetShopState();
    await query(`UPDATE products SET stock = 14 WHERE slug IN ($1, $2)`, [DIRECT, IN_CART]);
    await page.goto(`/productos/${IN_CART}`);
    await dismissCookies(page);
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await expect(page).toHaveURL(/aviso=carrito-anadido/);
  });
  test.afterAll(async () => {
    await resetShopState();
  });

  test('checkout solo con ese producto y sin código; al pagar, el carrito principal sigue igual', async ({ page }) => {
    const [direct, inCart] = await Promise.all([productName(DIRECT), productName(IN_CART)]);
    await buyNow(page, 2);
    const summary = page.getByRole('complementary', { name: 'Tu pedido' });
    await expect(summary).toContainText(direct);
    await expect(summary).toContainText('× 2');
    await expect(summary).not.toContainText(inCart);
    await expect(page.getByLabel('Código de descuento')).toHaveCount(0);
    await axeCheck(page);

    await fillCheckout(page);
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();
    await page.getByRole('button', { name: 'Pagar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^Pedido PC-\d+ confirmado$/ })).toBeVisible();

    await page.goto('/carrito');
    await expect(page.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();
    await expect(page.locator('#contenido')).toContainText(inCart);
    await expect(page.locator('#contenido')).not.toContainText(direct);
  });

  test('al abandonar el checkout directo, el carrito principal sigue igual', async ({ page }) => {
    const [direct, inCart] = await Promise.all([productName(DIRECT), productName(IN_CART)]);
    await buyNow(page, 1);
    await page.goto('/carrito');
    await expect(page.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();
    await expect(page.locator('#contenido')).toContainText(inCart);
    await expect(page.locator('#contenido')).not.toContainText(direct);
  });
});
