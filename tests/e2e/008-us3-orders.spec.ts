import { createCustomer, insertOrder, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, isNoJs, loginAs, loginAsNew, test } from './fixtures';

// US3 (feature 008): avanzar un pedido de tarjeta hasta "Entregado" (visible en "Mis pedidos" del
// comprador, con un correo por paso) y cancelar otro con su motivo interno. También sin JavaScript.

const BUYER = 'comprador-008-us3@example.test';

test.describe('008 · US3: cambiar el estado de un pedido', () => {
  test.beforeEach(async () => {
    await resetAccountState();
    await resetShopState();
    await fakeEmails.clear();
  });

  test('avanzar hasta Entregado y verlo en Mis pedidos', async ({ page }) => {
    const customer = await createCustomer({ email: BUYER });
    await insertOrder({ number: 'E2E-000301', customerId: customer.id, email: BUYER, status: 'paid' });
    await loginAsNew(page, { admin: true });

    await page.goto('/admin/pedidos');
    await dismissCookies(page);
    await page.getByRole('link', { name: 'E2E-000301' }).click();
    await expect(page.getByRole('heading', { name: 'Pedido E2E-000301' })).toBeVisible();
    await axeCheck(page);
    // Un pedido pagado no ofrece "Marcar como entregado" todavía.
    await expect(page.getByRole('button', { name: 'Marcar como entregado' })).toHaveCount(0);

    for (const [button, label] of [
      ['Pasar a «En preparación»', 'En preparación'],
      ['Marcar como enviado', 'Enviado'],
      ['Marcar como entregado', 'Entregado'],
    ] as const) {
      await page.getByRole('button', { name: button }).click();
      await expect(page.getByRole('status')).toContainText('Estado del pedido cambiado');
      await expect(page.getByRole('heading', { name: 'Pedido E2E-000301' }).locator('..')).toContainText(label);
    }
    await expect(page.getByRole('link', { name: 'Cancelar pedido' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Historial' }).locator('..')).toContainText('Enviado → Entregado');
    await axeCheck(page);

    await expect.poll(async () => (await fakeEmails.to(BUYER)).length, { timeout: 10_000 }).toBe(3);

    await loginAs(page, customer);
    await page.goto('/mi-cuenta/pedidos');
    await expect(page.getByRole('table', { name: 'Mis pedidos' }).getByRole('row', { name: /E2E-000301/ })).toContainText('Entregado');
  });

  test('cancelar con motivo interno', async ({ page }, testInfo) => {
    await insertOrder({ number: 'E2E-000302', email: BUYER, status: 'paid' });
    await loginAsNew(page, { admin: true });
    await page.goto('/admin/pedidos?estado=paid');
    await dismissCookies(page);
    await page.getByRole('link', { name: 'E2E-000302' }).click();
    await page.getByRole('link', { name: 'Cancelar pedido' }).click();
    await expect(page.getByRole('heading', { name: 'Cancelar el pedido E2E-000302' })).toBeVisible();
    await axeCheck(page);

    // Con JavaScript, el envío vacío vuelve con el error junto al campo; sin él, lo impide el navegador.
    if (!isNoJs(testInfo.project.name)) {
      await page.getByRole('button', { name: 'Cancelar el pedido' }).click();
      await expect(page.locator('#note-error')).toContainText('Escribe el motivo');
      await axeCheck(page);
    }
    await page.getByLabel('Motivo interno').fill('Rotura en el almacén');
    await page.getByRole('button', { name: 'Cancelar el pedido' }).click();
    await expect(page).toHaveURL(/\/admin\/pedidos\/[0-9a-f-]{36}\?aviso=cancelado.*volver=/);
    await expect(page.getByRole('status')).toContainText('Pedido cancelado');
    await expect(page.getByText('Rotura en el almacén')).toBeVisible();

    // "Volver" conserva el filtro de la lista.
    await page.getByRole('link', { name: 'Volver a los pedidos' }).click();
    await expect(page).toHaveURL(/\/admin\/pedidos\?estado=paid$/);

    await expect.poll(async () => (await fakeEmails.to(BUYER)).length, { timeout: 10_000 }).toBe(1);
    const [mail] = await fakeEmails.to(BUYER);
    expect(JSON.stringify(mail)).not.toContain('Rotura');
  });
});
