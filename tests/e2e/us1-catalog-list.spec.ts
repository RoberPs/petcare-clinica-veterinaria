import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

type Content = Record<string, any>;
const setTienda = (c: Content, href: string | null) => {
  c.sections = (c.sections as { key: string }[]).map((s) => (s.key === 'tienda' ? { ...s, href } : s));
};

test.describe('US1 · listado de productos', () => {
  test('la cabecera lleva al catálogo, con el aviso, el total y 12 tarjetas completas', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    const header = page.getByRole('banner');
    const link = header.getByRole('link', { name: 'Nuestros productos' }).first();
    if (await link.isVisible()) {
      await link.click();
    } else {
      await page.goto('/productos');
    }
    await expect(page).toHaveURL(/\/productos$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nuestros productos');
    await expect(page.locator('.shop-notice')).toHaveText('Tienda de demostración: estos productos no están a la venta.');
    await expect(page.locator('#resultados')).toHaveText('24 productos');

    const cards = page.locator('.product-grid > li .product');
    await expect(cards).toHaveCount(12);
    const first = cards.first();
    await expect(first).toHaveAttribute('href', '/productos/pienso-perro-adulto');
    await expect(first.locator('.product__meta')).toHaveText('Alimentación · Perro');
    await expect(first.locator('h3')).toHaveText('Pienso de pollo para perro adulto, 12 kg');
    await expect(first.locator('img')).toHaveAttribute('alt', 'Saco de pienso ilustrado con una huella en la etiqueta');
    for (const price of await page.locator('.product .price').allTextContents()) {
      expect(price).toMatch(/\d{1,3}(\.\d{3})*,\d{2} €/);
    }
    // Sin botones de compra (FR-019).
    await expect(page.locator('.product-grid button')).toHaveCount(0);
    await axeCheck(page);
  });

  test('la tarjeta abre su ficha con el teclado', async ({ page }) => {
    await page.goto('/productos');
    await dismissCookies(page);
    const first = page.locator('.product').first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/productos\/pienso-perro-adulto$/);
  });

  test('la página 2 tiene los 12 restantes, aria-current y su canonical', async ({ page }) => {
    await page.goto('/productos');
    const nav = page.getByRole('navigation', { name: 'Paginación' });
    await expect(nav.getByRole('link', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('link', { name: 'Siguiente' }).click();
    await expect(page).toHaveURL(/\/productos\?pagina=2$/);
    await expect(page.locator('.product')).toHaveCount(12);
    await expect(nav.getByRole('link', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', '/productos');
    await expect(nav.getByRole('link', { name: 'Siguiente' })).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/productos\?pagina=2$/);
    // Los agotados van al final del orden "Destacados".
    await expect(page.locator('.product').last()).toContainText('Agotado');
    await page.goto('/productos');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/productos$/);
  });

  test('funciona igual sin JavaScript', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    await page.goto('/productos?pagina=2');
    await expect(page.locator('#resultados')).toHaveText('24 productos');
    await expect(page.locator('.product')).toHaveCount(12);
    await page.getByRole('navigation', { name: 'Paginación' }).getByRole('link', { name: 'Página 1' }).click();
    await expect(page).toHaveURL(/\/productos$/);
  });

  test.describe('con otro contenido', () => {
    test.describe.configure({ mode: 'serial' });
    test.skip(({ isMobile, javaScriptEnabled }) => isMobile || !javaScriptEnabled, 'recarga contenido: basta con el proyecto desktop');
    test.afterAll(async () => {
      await loadPetcare();
    });

    test('"1 producto" en singular y sin paginación', async ({ page }) => {
      await loadPetcareVariant((c: Content) => {
        c.shop.products = c.shop.products.slice(0, 1);
      });
      await page.goto('/productos');
      await expect(page.locator('#resultados')).toHaveText('1 producto');
      await expect(page.locator('.product')).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Paginación' })).toHaveCount(0);
    });

    test('un catálogo vacío muestra el estado vacío con enlaces al inicio y a contacto', async ({ page }) => {
      await loadPetcareVariant((c: Content) => {
        c.shop.products = [];
      });
      await page.goto('/productos');
      const empty = page.locator('.empty-state');
      await expect(empty).toContainText('Todavía no hay productos en la tienda');
      await expect(empty.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
      await expect(empty.getByRole('link', { name: 'Contactar con la clínica' })).toHaveAttribute('href', '/contacto');
      await axeCheck(page);
    });

    test('con la tienda apagada, /productos da 404 y la cabecera lleva a Próximamente', async ({ page }) => {
      await loadPetcareVariant((c: Content) => setTienda(c, null));
      const res = await page.goto('/productos');
      expect(res!.status()).toBe(404);
      const res2 = await page.goto('/productos/pienso-perro-adulto');
      expect(res2!.status()).toBe(404);
      await page.goto('/');
      await expect(page.getByRole('banner').getByRole('link', { name: 'Nuestros productos' }).first()).toHaveAttribute(
        'href',
        '/proximamente/tienda',
      );
    });
  });
});
