import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

const PIENSO = '/productos/pienso-perro-adulto';

test.describe('US2 · ficha de producto', () => {
  test('muestra migas, imagen, chip, título, precio, mascotas, disponibilidad y aviso', async ({ page }) => {
    await page.goto(PIENSO);
    const crumbs = page.getByRole('navigation', { name: 'Migas de pan' });
    await expect(crumbs.getByRole('link', { name: 'Nuestros productos' })).toHaveAttribute('href', '/productos');
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Pienso de pollo para perro adulto, 12 kg');

    await expect(page.locator('.detail__gallery img')).toHaveAttribute('alt', 'Saco de pienso ilustrado con una huella en la etiqueta');
    const info = page.locator('.detail__info');
    await expect(info.locator('.detail__chip')).toHaveText('Alimentación · Perro');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pienso de pollo para perro adulto, 12 kg');
    await expect(info).toContainText('Croquetas de pollo para el día a día de perros adultos de tamaño medio.');
    await expect(info.locator('.price')).toContainText('42,50 €');
    await expect(info).toContainText('Para: Perro');
    await expect(info.locator('.badge')).toHaveText('En stock · Envío en 24-48 h');
    await expect(info.locator('.shop-notice')).toHaveText('Tienda de demostración: los pagos son de prueba y no se envía nada.');
    // Feature 005 (FR-001, sustituye FR-019): cantidad y "Añadir al carrito".
    await expect(page.getByRole('main').getByRole('button', { name: 'Añadir al carrito', exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('spinbutton', { name: 'Cantidad' })).toHaveAttribute('max', '10');
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);

    await expect(page).toHaveTitle(/^Pienso de pollo para perro adulto, 12 kg · Nuestros productos/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/productos\/pienso-perro-adulto$/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /pienso-perro-adulto\.svg$/);
    await axeCheck(page);
  });

  test('las pestañas son enlaces con ?pestana= y se recorren con el teclado', async ({ page }) => {
    await page.goto(PIENSO);
    await dismissCookies(page);
    const tabs = page.getByRole('navigation', { name: 'Información del producto' });
    await expect(tabs.getByRole('link')).toHaveText(['Descripción', 'Ingredientes', 'Modo de uso']);
    await expect(tabs.getByRole('link', { name: 'Descripción' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.detail__panel')).toContainText('Croquetas de tamaño medio');

    const ingredients = tabs.getByRole('link', { name: 'Ingredientes' });
    await ingredients.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\?pestana=ingredientes#pestanas$/);
    await expect(tabs.getByRole('link', { name: 'Ingredientes' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.detail__panel')).toContainText('Carne de pollo deshidratada');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/productos\/pienso-perro-adulto$/);

    await page.goto(`${PIENSO}?pestana=xyz`);
    await expect(tabs.getByRole('link', { name: 'Descripción' })).toHaveAttribute('aria-current', 'true');
  });

  test('sin ingredientes ni modo de uso no hay barra de pestañas', async ({ page }) => {
    await page.goto('/productos/pelota-caucho-flotante');
    await expect(page.locator('nav.tabs')).toHaveCount(0);
    await expect(page.locator('.detail__panel')).toContainText('Caucho natural');
  });

  test('un producto agotado lo indica', async ({ page }) => {
    await page.goto('/productos/arena-aglomerante-gato');
    await expect(page.locator('.detail__info .badge')).toHaveText('Agotado');
    await expect(page.locator('.detail__info .badge')).toHaveClass(/badge--muted/);
  });

  test('un producto para varias mascotas las lista todas', async ({ page }) => {
    await page.goto('/productos/champu-piel-sensible');
    await expect(page.locator('.detail__chip')).toHaveText('Higiene · Perro, Gato');
    await expect(page.locator('.detail__info')).toContainText('Para: Perro, Gato');
  });

  test('un producto inexistente da 404 con enlace al catálogo', async ({ page }) => {
    const res = await page.goto('/productos/no-existe');
    expect(res!.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No hemos encontrado este producto');
    await expect(page.getByRole('main').getByRole('link', { name: 'Ver todo el catálogo' })).toHaveAttribute('href', '/productos');
    await axeCheck(page);
  });

  test('sin JavaScript las pestañas funcionan igual', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    await page.goto(PIENSO);
    await page.getByRole('navigation', { name: 'Información del producto' }).getByRole('link', { name: 'Modo de uso' }).click();
    await expect(page).toHaveURL(/\?pestana=modo-de-uso#pestanas$/);
    await expect(page.locator('.detail__panel')).toContainText('dos tomas');
  });

  test.describe('con el aviso desactivado', () => {
    test.skip(({ isMobile, javaScriptEnabled }) => isMobile || !javaScriptEnabled, 'recarga contenido: basta con el proyecto desktop');
    test.afterAll(async () => {
      await loadPetcare();
    });

    test('no aparece ni en la ficha ni en el listado (FR-019b)', async ({ page }) => {
      await loadPetcareVariant((c: Record<string, any>) => {
        c.shop.settings.demo_notice = { enabled: false };
      });
      await page.goto(PIENSO);
      await expect(page.locator('.shop-notice')).toHaveCount(0);
      await page.goto('/productos');
      await expect(page.locator('.shop-notice')).toHaveCount(0);
    });
  });
});
