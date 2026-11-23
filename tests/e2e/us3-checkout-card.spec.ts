import type { Page } from '@playwright/test';
import { loadPetcare, query, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, test } from './fixtures';

// US3 (feature 005) · finalizar la compra y pagar con tarjeta en la pasarela simulada (D2).
// La pasarela simulada es una página propia con formularios: también funciona sin JavaScript.

const SLUG = 'pienso-perro-adulto';
const BUYER = 'comprador-us3@example.test';

/** Importe como lo pinta formatEur, con el espacio duro antes del símbolo. */
const eur = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')} €`;

async function addToCart(page: Page, quantity: number) {
  await page.goto(`/productos/${SLUG}`);
  await dismissCookies(page);
  await page.getByLabel('Cantidad').fill(String(quantity));
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await expect(page).toHaveURL(/aviso=carrito-/);
}

async function goToCheckout(page: Page) {
  await page.goto('/carrito');
  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(page).toHaveURL(/\/finalizar-compra$/);
}

async function fillCheckout(page: Page, overrides: { postalCode?: string } = {}) {
  await page.getByLabel('Correo electrónico', { exact: true }).fill(BUYER);
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
  await page.getByLabel('Dirección', { exact: true }).fill('Calle de la Prueba 3, 2.º B');
  await page.getByLabel('Código postal', { exact: true }).fill(overrides.postalCode ?? '28001');
  await page.getByLabel('Ciudad', { exact: true }).fill('Madrid');
  // El token del formulario exige unos segundos desde que se pinta (anti-robots, R5).
  await page.waitForTimeout(3_200);
}

async function confirm(page: Page) {
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();
}

async function priceCents(): Promise<number> {
  const [p] = await query<{ price_cents: number }>(`SELECT price_cents FROM products WHERE slug = $1`, [SLUG]);
  return p!.price_cents;
}

async function stock(): Promise<number> {
  const [p] = await query<{ stock: number }>(`SELECT stock FROM products WHERE slug = $1`, [SLUG]);
  return p!.stock;
}

async function emailWithSubject(subject: RegExp, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await fakeEmails.to(BUYER)).filter((e) => subject.test(e.body.subject ?? ''));
    if (found.length > 0) return found[found.length - 1]!;
    if (Date.now() > deadline) throw new Error(`No ha llegado el correo ${subject}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.describe('US3 · finalizar la compra con tarjeta', () => {
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
    await loadPetcare();
  });

  test('pasos, aviso de demostración, pago simulado y confirmación con los mismos totales', async ({ page }) => {
    await addToCart(page, 2);
    const total = (await priceCents()) * 2;

    await page.goto('/carrito');
    await expect(page.getByRole('complementary', { name: 'Resumen del pedido' })).toContainText(eur(total));
    await goToCheckout(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Finalizar compra' })).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText('2 Datos y pago');
    await expect(page.getByRole('note').filter({ hasText: 'Tienda de demostración: los pagos' })).toBeVisible();
    await expect(page.locator('form.form').getByRole('link', { name: 'condiciones de venta' })).toHaveAttribute('href', '/condiciones-de-venta');
    const summary = page.getByRole('complementary', { name: 'Tu pedido' });
    await expect(summary).toContainText(eur(total));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await axeCheck(page);

    await fillCheckout(page);
    await confirm(page);
    await expect(page).toHaveURL(/\/pago-simulado\/fake_[0-9a-f-]+$/);
    await expect(page.getByText('Simulación: no es una pasarela real')).toBeVisible();
    await expect(page.getByText(eur(total), { exact: true })).toBeVisible();
    await axeCheck(page);

    await page.getByRole('button', { name: 'Pagar' }).click();
    await expect(page).toHaveURL(/\/pedido\/confirmado\?ref=/);
    const heading = page.getByRole('heading', { level: 1, name: /^Pedido PC-\d+ confirmado$/ });
    await expect(heading).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText('3 Confirmación');
    await expect(page.getByText('Estado: Pagado')).toBeVisible();
    const number = (await heading.textContent())!.match(/PC-\d+/)![0];
    await expect(page.getByRole('complementary', { name: `Pedido ${number}` })).toContainText(eur(total));
    await axeCheck(page);

    // Stock descontado, carrito vaciado y un solo correo de confirmación con el mismo total (SC-005).
    expect(await stock()).toBe(12);
    await expect(page.getByRole('link', { name: 'Carrito, 0 productos' })).toBeVisible();
    const email = await emailWithSubject(new RegExp(`^Pedido ${number} confirmado$`));
    expect(email.body.textContent).toContain(eur(total));
    const [{ n }] = (await query<{ n: string }>(`SELECT count(*)::text AS n FROM email_outbox WHERE kind = 'order_confirmed'`)) as [{ n: string }];
    expect(n).toBe('1');
  });

  test('errores junto al campo, anunciados y conservando lo escrito', async ({ page }) => {
    await addToCart(page, 1);
    await goToCheckout(page);
    await fillCheckout(page, { postalCode: '53000' });
    await confirm(page);

    await expect(page).toHaveURL(/\/finalizar-compra$/);
    await expect(page.locator('.form-summary[role="alert"]')).toContainText('Código postal');
    const postal = page.getByLabel('Código postal', { exact: true });
    await expect(postal).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#postal_code-error')).toHaveText('Código postal no válido');
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Lucía');
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toHaveValue(BUYER);
    const [{ n }] = (await query<{ n: string }>(`SELECT count(*)::text AS n FROM orders`)) as [{ n: string }];
    expect(n).toBe('0');
    await axeCheck(page);
  });

  test('"Simular rechazo" y "Cancelar": pago no completado, carrito intacto y reintento', async ({ page }) => {
    await addToCart(page, 1);
    await goToCheckout(page);
    await fillCheckout(page);
    await confirm(page);
    await expect(page).toHaveURL(/\/pago-simulado\//);

    await page.getByRole('button', { name: 'Simular rechazo' }).click();
    await expect(page.locator('.form-summary[role="alert"]')).toContainText('Tarjeta rechazada (simulación)');

    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page).toHaveURL(/\/pedido\/pago-no-completado\?ref=/);
    await expect(page.getByRole('heading', { level: 1, name: 'No se ha completado el pago' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();
    await axeCheck(page);

    // El stock queda reservado mientras el pedido sigue pendiente y se puede volver a pagar.
    expect(await stock()).toBe(13);
    await page.getByRole('button', { name: 'Reintentar pago' }).click();
    await expect(page).toHaveURL(/\/pago-simulado\/fake_/);

    // Cancelar el pedido pide confirmación y libera la reserva; el carrito sigue igual.
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('link', { name: 'Cancelar pedido' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar el pedido' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Hemos cancelado el pedido' })).toBeVisible();
    expect(await stock()).toBe(14);
    await expect(page.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();
  });

  test('stock agotado entre el carrito y "Confirmar pedido": vuelta al carrito con la cantidad ajustada', async ({ page }) => {
    await addToCart(page, 3);
    await goToCheckout(page);
    await fillCheckout(page);
    await query(`UPDATE products SET stock = 1 WHERE slug = $1`, [SLUG]);
    await confirm(page);

    await expect(page).toHaveURL(/\/carrito\?aviso=carrito-ajustado$/);
    await expect(page.getByText('Hemos ajustado las cantidades a las unidades disponibles. Revisa tu carrito.')).toBeVisible();
    await expect(page.getByRole('spinbutton').first()).toHaveValue('1');
    const [{ n }] = (await query<{ n: string }>(`SELECT count(*)::text AS n FROM orders`)) as [{ n: string }];
    expect(n).toBe('0');
  });
});
