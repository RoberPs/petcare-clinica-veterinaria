import type { Locator, Page } from '@playwright/test';
import { insertOrder, query, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, loginAsNew, test } from './fixtures';

// SC-007 (feature 008): axe en todas las rutas nuevas del panel de la tienda, con y sin
// JavaScript, también con sus avisos; y un ajuste de stock hecho solo con el teclado, con el foco
// siempre visible, también tras el aviso.

const SLUG = 'pienso-perro-adulto';

/** Pulsa Tab hasta que `target` tiene el foco y comprueba que el foco se ve. */
async function tabTo(page: Page, target: Locator, max = 120): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) {
      await expectVisibleFocus(target);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error('No se ha llegado al elemento con el tabulador');
}

async function expectVisibleFocus(target: Locator): Promise<void> {
  const outline = await target.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
  });
  expect((outline.style !== 'none' && outline.width > 0) || outline.shadow !== 'none', 'foco visible').toBe(true);
}

test.describe('008 · accesibilidad del panel de la tienda', () => {
  let productId = '';
  let orderId = '';
  let originalStock = 0;

  test.beforeAll(async () => {
    const [p] = await query<{ id: string; stock: number }>('SELECT id, stock FROM products WHERE slug = $1', [SLUG]);
    productId = p!.id;
    originalStock = p!.stock;
  });
  test.beforeEach(async () => {
    await resetAccountState();
    await resetShopState();
    orderId = await insertOrder({ number: 'E2E-A11Y01', status: 'paid' });
  });
  test.afterAll(async () => {
    await query('UPDATE products SET stock = $2 WHERE id = $1', [productId, originalStock]);
  });

  test('axe sin errores en todas las rutas nuevas y sus avisos', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'basta con un perfil con JavaScript y el perfil sin JavaScript');
    await loginAsNew(page, { admin: true });
    const routes = [
      '/admin/productos',
      '/admin/productos?q=zzzz',
      '/admin/productos/nuevo',
      `/admin/productos/${productId}`,
      `/admin/productos/${productId}?aviso=guardado`,
      `/admin/productos/${productId}?aviso=desactivado`,
      `/admin/productos/${productId}/stock`,
      `/admin/productos/${productId}/stock?aviso=stock-insuficiente&max=3`,
      '/admin/pedidos',
      '/admin/pedidos?estado=delivered',
      `/admin/pedidos/${orderId}`,
      `/admin/pedidos/${orderId}?aviso=pedido-cambiado`,
      `/admin/pedidos/${orderId}/cancelar`,
      '/admin/descuentos',
      '/admin/descuentos?aviso=creado',
      '/admin/descuentos/nuevo',
    ];
    let first = true;
    for (const route of routes) {
      const res = await page.goto(route);
      expect(res?.status(), route).toBe(200);
      if (first) {
        await dismissCookies(page);
        first = false;
      }
      await axeCheck(page);
    }
  });

  test('ajuste de stock solo con el teclado y foco visible tras el aviso', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-360', 'el recorrido de teclado se hace en escritorio y sin JavaScript');
    await loginAsNew(page, { admin: true });
    await page.goto(`/admin/productos/${productId}/stock`);
    await dismissCookies(page);

    await tabTo(page, page.getByLabel('Cantidad'));
    await page.keyboard.type('2');
    await tabTo(page, page.getByLabel('Motivo'));
    await tabTo(page, page.getByRole('button', { name: 'Ajustar el stock' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Stock ajustado');

    // Tras el aviso, el recorrido con el tabulador sigue con el foco visible.
    const back = page.getByRole('link', { name: 'Volver al producto' });
    await tabTo(page, back);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/admin/productos/${productId}$`));
    await expect(page.getByRole('heading', { name: /^Editar producto/ })).toBeVisible();
  });
});
