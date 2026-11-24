import { loadPetcare, query, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, loginAsNew, test } from './fixtures';

// US5 (feature 008): compra con recogida y pago en la clínica, y "Confirmar pago y entrega" desde
// el detalle del pedido en el panel. También sin JavaScript.

const SLUG = 'pienso-perro-adulto';
const BUYER = 'comprador-008-us5@example.test';

test.describe('008 · US5: pago en la clínica', () => {
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async () => {
    await resetAccountState();
    await resetShopState();
    await fakeEmails.clear();
  });

  test('confirmar pago y entrega en un solo paso', async ({ page }) => {
    await page.goto(`/productos/${SLUG}`);
    await dismissCookies(page);
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await expect(page).toHaveURL(/aviso=carrito-/);
    await page.goto('/finalizar-compra');
    await page.getByLabel('Correo electrónico', { exact: true }).fill(BUYER);
    await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
    await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
    await page.getByRole('group', { name: 'Método de envío' }).getByRole('radio', { name: /Recogida en la clínica/ }).check();
    await page.getByRole('group', { name: 'Método de pago' }).getByRole('radio', { name: /Pago en la clínica/ }).check();
    await page.waitForTimeout(3_200);
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();
    await expect(page).toHaveURL(/\/pedido\/confirmado\?ref=/);
    const [order] = await query<{ number: string }>('SELECT number FROM orders');

    await loginAsNew(page, { admin: true });
    await page.goto('/admin/pedidos?estado=pending_payment');
    await page.getByRole('link', { name: order!.number }).click();
    await expect(page.getByRole('button', { name: 'Confirmar pago', exact: true })).toBeVisible();
    await axeCheck(page);
    await page.getByRole('button', { name: 'Confirmar pago y entrega' }).click();
    await expect(page.getByRole('status')).toContainText('Pago y entrega confirmados');
    await expect(page.getByRole('heading', { name: `Pedido ${order!.number}` }).locator('..')).toContainText('Entregado');
    await expect(page.getByRole('button', { name: 'Confirmar pago y entrega' })).toHaveCount(0);
    await axeCheck(page);

    expect(await query('SELECT to_status FROM order_status_history ORDER BY created_at')).toEqual([
      { to_status: 'pending_payment' },
      { to_status: 'paid' },
      { to_status: 'delivered' },
    ]);
    await expect
      .poll(async () => (await fakeEmails.to(BUYER)).filter((e) => /pagado y entregado/.test(e.body.subject ?? '')).length, { timeout: 10_000 })
      .toBe(1);
  });
});
