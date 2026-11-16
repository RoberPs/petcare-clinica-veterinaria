import { createCustomer, insertOrder, loadPetcare, query, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, loginAs, test } from './fixtures';

// US5 (feature 005) · "Mis pedidos": lista, detalle con historial, acciones de un pendiente,
// bloque "Últimos pedidos" del resumen y 404 en un pedido ajeno (SC-006).

test.describe('US5 · mis pedidos', () => {
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async () => {
    await resetShopState();
    await resetAccountState();
  });
  test.afterAll(async () => {
    await resetShopState();
  });

  test('resumen sin pedidos: invitación a la tienda', async ({ page }) => {
    const c = await createCustomer();
    await loginAs(page, c);
    await page.goto('/mi-cuenta');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { name: 'Últimos pedidos' })).toBeVisible();
    await expect(page.getByText('Aún no has hecho ningún pedido.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver la tienda' })).toHaveAttribute('href', '/productos');
  });

  test('lista, detalle con historial y bloque "Últimos pedidos"', async ({ page }) => {
    const c = await createCustomer();
    await insertOrder({ number: 'PC-000101', customerId: c.id, status: 'delivered', minutesAgo: 400 });
    await insertOrder({ number: 'PC-000102', customerId: c.id, status: 'shipped', minutesAgo: 300 });
    await insertOrder({ number: 'PC-000103', customerId: c.id, status: 'paid', minutesAgo: 200 });
    await insertOrder({ number: 'PC-000104', customerId: c.id, status: 'pending_payment', minutesAgo: 1 });
    await loginAs(page, c);

    await page.goto('/mi-cuenta');
    await dismissCookies(page);
    const latest = page.getByRole('table', { name: 'Últimos pedidos' });
    await expect(latest.getByRole('row')).toHaveCount(4);
    await expect(latest.getByRole('row').nth(1)).toContainText('PC-000104');
    await expect(page.getByRole('link', { name: 'Ver todos mis pedidos' })).toBeVisible();

    await page.getByRole('navigation', { name: 'Mi cuenta' }).getByRole('link', { name: 'Mis pedidos' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/pedidos$/);
    await expect(page.locator('.side-nav [aria-current="page"]')).toHaveText('Mis pedidos');
    const table = page.getByRole('table', { name: 'Mis pedidos' });
    await expect(table.getByRole('columnheader')).toHaveText(['Pedido', 'Fecha', 'Estado', 'Total']);
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(table.getByRole('row').nth(1)).toContainText('Pendiente de pago');
    await expect(table.getByRole('row').nth(4)).toContainText('Entregado');
    await expect(table.getByRole('row').nth(4)).toContainText('€');
    await axeCheck(page);

    await table.getByRole('link', { name: 'PC-000102' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/pedidos\/PC-000102$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Pedido PC-000102' })).toBeVisible();
    await expect(page.getByText('Estado: Enviado')).toBeVisible();
    await expect(page.locator('.order-history li')).toHaveCount(2);
    // Un pedido ya pagado no ofrece ni reintentar ni cancelar.
    await expect(page.getByRole('button', { name: 'Reintentar pago' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Cancelar pedido' })).toHaveCount(0);
    await axeCheck(page);
  });

  test('pendiente: "Reintentar pago" y "Cancelar pedido" con confirmación', async ({ page }) => {
    const c = await createCustomer();
    await insertOrder({ number: 'PC-000201', customerId: c.id, status: 'pending_payment' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta/pedidos/PC-000201');
    await dismissCookies(page);

    await page.getByRole('button', { name: 'Reintentar pago' }).click();
    await expect(page).toHaveURL(/\/pago-simulado\/fake_/);

    await page.goto('/mi-cuenta/pedidos/PC-000201');
    await page.getByRole('link', { name: 'Cancelar pedido' }).click();
    await expect(page.getByRole('heading', { name: '¿Cancelar el pedido PC-000201?' })).toBeVisible();
    await axeCheck(page);
    await page.getByRole('button', { name: 'Sí, cancelar el pedido' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/pedidos\/PC-000201\?aviso=pedido-cancelado$/);
    await expect(page.getByRole('status').filter({ hasText: 'Hemos cancelado el pedido' })).toBeVisible();
    await expect(page.getByText('Estado: Cancelado')).toBeVisible();
    const [o] = await query<{ status: string; cancel_reason: string }>(`SELECT status, cancel_reason FROM orders WHERE number = 'PC-000201'`);
    expect(o).toEqual({ status: 'cancelled', cancel_reason: 'customer' });
  });

  test('pedido ajeno o inexistente → 404', async ({ page }) => {
    const owner = await createCustomer();
    const other = await createCustomer();
    await insertOrder({ number: 'PC-000301', customerId: owner.id });
    await loginAs(page, other);
    for (const n of ['PC-000301', 'PC-999999']) {
      const res = await page.goto(`/mi-cuenta/pedidos/${n}`);
      expect(res?.status()).toBe(404);
    }
  });
});
