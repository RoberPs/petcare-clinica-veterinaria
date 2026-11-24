import { insertOrder, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, loginAsNew, test } from './fixtures';

// US2 (feature 008): lista de pedidos con pestañas de estado (aria-current y recuento), búsqueda
// por número, estado vacío y "Volver" desde el detalle conservando el filtro.

test.describe('008 · US2: lista de pedidos', () => {
  test.beforeEach(async () => {
    await resetAccountState();
    await resetShopState();
    await insertOrder({ number: 'E2E-000001', status: 'paid', minutesAgo: 30 });
    await insertOrder({ number: 'E2E-000002', status: 'paid', minutesAgo: 20 });
    await insertOrder({ number: 'E2E-000003', status: 'shipped', minutesAgo: 10 });
    await insertOrder({ number: 'E2E-000004', status: 'pending_payment', minutesAgo: 5 });
  });

  test('pestañas, búsqueda, detalle y vuelta con el filtro', async ({ page }) => {
    await loginAsNew(page, { admin: true });
    await page.goto('/admin/pedidos');
    await dismissCookies(page);
    await axeCheck(page);

    const tabs = page.getByRole('navigation', { name: 'Filtrar pedidos por estado' });
    await expect(tabs.getByRole('link', { name: /^Todos/ })).toHaveAttribute('aria-current', 'page');
    await expect(tabs.getByRole('link', { name: /^Pagado/ })).toContainText('2');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);

    await tabs.getByRole('link', { name: /^Pagado/ }).click();
    await expect(page).toHaveURL(/\/admin\/pedidos\?estado=paid$/);
    await expect(tabs.getByRole('link', { name: /^Pagado/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);
    await axeCheck(page);

    // Detalle y vuelta a la lista filtrada.
    await page.getByRole('link', { name: 'E2E-000002' }).click();
    await expect(page.getByRole('heading', { name: 'Pedido E2E-000002' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
    await expect(page.getByText('Lucía Prueba')).toBeVisible();
    await axeCheck(page);
    await page.getByRole('link', { name: 'Volver a los pedidos' }).click();
    await expect(page).toHaveURL(/\/admin\/pedidos\?estado=paid$/);

    // Búsqueda por número (sin distinguir mayúsculas).
    await page.getByLabel('Número de pedido').fill('e2e-000003');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/numero=e2e-000003/i);
    await expect(page.getByText('Ningún pedido empieza por ese número.')).toBeVisible();
    await tabs.getByRole('link', { name: /^Todos/ }).click();
    await expect(page.getByRole('link', { name: 'E2E-000003' })).toBeVisible();

    // Estado vacío.
    await page.goto('/admin/pedidos?estado=delivered');
    await expect(page.getByText('No hay pedidos en este estado.')).toBeVisible();
    await axeCheck(page);
  });

  test('un id inexistente da 404', async ({ page }) => {
    await loginAsNew(page, { admin: true });
    expect((await page.goto('/admin/pedidos/00000000-0000-4000-8000-000000000000'))?.status()).toBe(404);
    expect((await page.goto('/admin/pedidos/no-es-un-id'))?.status()).toBe(404);
  });
});
