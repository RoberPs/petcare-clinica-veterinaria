import type { Page } from '@playwright/test';
import { loadPetcare, query, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, test } from './fixtures';

// US9 (feature 005) · código de descuento en el carrito: aplicar, quitar, errores junto al campo y
// el mismo total en el carrito, el checkout y el correo. También sin JavaScript.

const SLUG = 'pienso-perro-adulto';
const BUYER = 'comprador-us9@example.test';

const eur = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')} €`;

async function price(slug: string): Promise<number> {
  const [p] = await query<{ price_cents: number }>('SELECT price_cents FROM products WHERE slug = $1', [slug]);
  return p!.price_cents;
}

async function addToCart(page: Page, slug: string, quantity: number) {
  await page.goto(`/productos/${slug}`);
  await dismissCookies(page);
  await page.getByLabel('Cantidad').fill(String(quantity));
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await expect(page).toHaveURL(/aviso=carrito-/);
  await page.goto('/carrito');
}

async function applyCode(page: Page, code: string) {
  await page.getByLabel('Código de descuento').fill(code);
  await page.getByRole('button', { name: 'Aplicar' }).click();
}

const summary = (page: Page) => page.getByRole('complementary', { name: 'Resumen del pedido' });

test.describe('US9 · código de descuento', () => {
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async () => {
    await resetShopState();
    await fakeEmails.clear();
    await query(`UPDATE products SET stock = 14 WHERE slug = $1`, [SLUG]);
  });
  test.afterAll(async () => {
    await resetShopState();
  });

  test('BIENVENIDA10: descuento con su importe, total rebajado y "Quitar"', async ({ page }) => {
    const subtotal = (await price(SLUG)) * 2;
    const discount = Math.round(subtotal * 0.1);
    await addToCart(page, SLUG, 2);
    await expect(summary(page)).toContainText(eur(subtotal));

    await applyCode(page, 'bienvenida10');
    await expect(page).toHaveURL(/\/carrito\?aviso=descuento-aplicado$/);
    const row = summary(page).locator('li, div, p').filter({ hasText: 'Descuento (BIENVENIDA10)' }).last();
    await expect(row).toContainText(eur(discount));
    await expect(summary(page)).toContainText(eur(subtotal - discount));
    await expect(page.getByText('Código aplicado: BIENVENIDA10')).toBeVisible();
    await axeCheck(page);

    await page.getByRole('button', { name: 'Quitar el código BIENVENIDA10' }).click();
    await expect(page).toHaveURL(/\/carrito\?aviso=descuento-retirado$/);
    await expect(summary(page)).not.toContainText('Descuento (BIENVENIDA10)');
    await expect(page.getByLabel('Código de descuento')).toBeVisible();
  });

  test('NOEXISTE: error junto al campo, anunciado, y el total no cambia', async ({ page }) => {
    const subtotal = await price(SLUG);
    await addToCart(page, SLUG, 1);
    await applyCode(page, 'NOEXISTE');
    const field = page.getByLabel('Código de descuento');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#code-error')).toHaveText('Este código no existe o ya no está activo.');
    await expect(field).toHaveValue('NOEXISTE');
    await expect(summary(page)).toContainText(eur(subtotal));
    await expect(summary(page)).not.toContainText('Descuento (');
    await axeCheck(page);
  });

  test('mínimo no alcanzado: "Este código requiere un pedido mínimo de 30,00 €"', async ({ page }) => {
    const [cheap] = await query<{ slug: string }>(
      `SELECT slug FROM products WHERE price_cents < 3000 AND stock > 0 AND published ORDER BY price_cents LIMIT 1`,
    );
    await addToCart(page, cheap!.slug, 1);
    await applyCode(page, 'PETCARE5');
    await expect(page.locator('#code-error')).toHaveText('Este código requiere un pedido mínimo de 30,00 €');
  });

  test('el total con descuento es el mismo en el checkout y en el correo', async ({ page }) => {
    const subtotal = (await price(SLUG)) * 2;
    const total = subtotal - Math.round(subtotal * 0.1);
    await addToCart(page, SLUG, 2);
    await applyCode(page, 'BIENVENIDA10');
    await expect(page).toHaveURL(/aviso=descuento-aplicado/);
    await page.getByRole('link', { name: 'Finalizar compra' }).click();
    const checkoutSummary = page.getByRole('complementary', { name: 'Tu pedido' });
    await expect(checkoutSummary).toContainText('Descuento (BIENVENIDA10)');
    await expect(checkoutSummary).toContainText(eur(total));

    await page.getByLabel('Correo electrónico', { exact: true }).fill(BUYER);
    await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
    await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
    await page.getByLabel('Dirección', { exact: true }).fill('Calle de la Prueba 3');
    await page.getByLabel('Código postal', { exact: true }).fill('28001');
    await page.getByLabel('Ciudad', { exact: true }).fill('Madrid');
    await page.waitForTimeout(3_200);
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();
    await expect(page.getByText(eur(total), { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pagar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^Pedido PC-\d+ confirmado$/ })).toBeVisible();

    const deadline = Date.now() + 10_000;
    let text = '';
    while (!text && Date.now() < deadline) {
      const mail = (await fakeEmails.to(BUYER)).find((e) => /confirmado$/.test(e.body.subject ?? ''));
      text = mail?.body.textContent ?? '';
      if (!text) await new Promise((r) => setTimeout(r, 200));
    }
    expect(text).toContain('Descuento (BIENVENIDA10)');
    expect(text).toContain(eur(total));
    const [o] = await query<{ discount_code: string; total_cents: number }>('SELECT discount_code, total_cents FROM orders');
    expect(o).toEqual({ discount_code: 'BIENVENIDA10', total_cents: total });
  });
});
