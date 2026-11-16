import type { Page } from '@playwright/test';
import { createCustomer, insertOrder, loadPetcare, query, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, loginAs, test } from './fixtures';

// US6 (feature 005) · comprar sin cuenta: correo solo para invitados, enlace privado en el correo,
// token manipulado → 404 y precarga de datos para el cliente con sesión.

const SLUG = 'pienso-perro-adulto';
const BUYER = 'invitado-us6@example.test';

async function addAndGoToCheckout(page: Page) {
  await page.goto(`/productos/${SLUG}`);
  await dismissCookies(page);
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await expect(page).toHaveURL(/aviso=carrito-/);
  await page.goto('/finalizar-compra');
  await expect(page.getByRole('heading', { level: 1, name: 'Finalizar compra' })).toBeVisible();
}

async function orderEmail(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await fakeEmails.to(BUYER)).filter((e) => /^Pedido PC-\d+ confirmado$/.test(e.body.subject ?? ''));
    if (found.length > 0) return found[found.length - 1]!;
    if (Date.now() > deadline) throw new Error('No ha llegado el correo del pedido');
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.describe('US6 · comprar sin cuenta', () => {
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async () => {
    await resetShopState();
    await resetAccountState();
    await fakeEmails.clear();
    await query(`UPDATE products SET stock = 14 WHERE slug = $1`, [SLUG]);
  });
  test.afterAll(async () => {
    await resetShopState();
  });

  test('invitado: correo con su finalidad, enlace privado en el correo y token manipulado → 404', async ({ page }) => {
    await addAndGoToCheckout(page);
    const email = page.getByLabel('Correo electrónico', { exact: true });
    await expect(email).toBeEditable();
    await expect(page.getByText('Solo para enviarte la confirmación y el enlace para seguir el pedido.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', /\/iniciar-sesion\?return_to=%2Ffinalizar-compra/);
    await expect(page.getByRole('link', { name: 'crea una cuenta' })).toBeVisible();

    await email.fill(BUYER);
    await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
    await page.getByLabel('Apellidos', { exact: true }).fill('Invitada');
    await page.getByLabel('Dirección', { exact: true }).fill('Calle de la Prueba 3');
    await page.getByLabel('Código postal', { exact: true }).fill('28001');
    await page.getByLabel('Ciudad', { exact: true }).fill('Madrid');
    await page.waitForTimeout(3_200);
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();
    await page.getByRole('button', { name: 'Pagar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^Pedido PC-\d+ confirmado$/ })).toBeVisible();

    const mail = await orderEmail();
    const path = (mail.body.textContent ?? '').match(/\/pedido\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
    expect(path).toBeTruthy();
    expect(mail.body.textContent).toContain('No lo compartas');

    const res = await page.goto(path!);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /^Pedido PC-\d+$/ })).toBeVisible();
    await expect(page.getByText('Estado: Pagado')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect(res?.headers()['cache-control']).toContain('no-store');
    await axeCheck(page);

    const [{ customer_id }] = (await query<{ customer_id: string | null }>('SELECT customer_id FROM orders')) as [{ customer_id: string | null }];
    expect(customer_id).toBeNull();

    const tampered = path!.slice(0, -2) + (path!.endsWith('AA') ? 'BB' : 'AA');
    expect((await page.goto(tampered))?.status()).toBe(404);
  });

  test('con sesión: correo de la cuenta y la dirección de su último pedido', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Marta' });
    await insertOrder({ number: 'PC-000401', customerId: c.id, email: c.email, minutesAgo: 60 });
    await loginAs(page, c);
    await addAndGoToCheckout(page);

    const email = page.getByLabel('Correo electrónico', { exact: true });
    await expect(email).toHaveValue(c.email);
    await expect(email).toHaveAttribute('readonly', '');
    await expect(page.getByRole('link', { name: 'Inicia sesión' })).toHaveCount(0);
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Lucía');
    await expect(page.getByLabel('Dirección', { exact: true })).toHaveValue('Calle de la Prueba 3');
    await expect(page.getByLabel('Código postal', { exact: true })).toHaveValue('28001');
    await axeCheck(page);
  });
});
