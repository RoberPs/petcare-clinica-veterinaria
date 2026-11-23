import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, expect, test } from './fixtures';

const card = (page: import('@playwright/test').Page, slug: string) => page.locator('article.product').filter({ has: page.locator(`a[href="/productos/${slug}"]`) });

test.describe('US5 · etiquetas Novedad y Oferta', () => {
  test('en las tarjetas: las dos juntas, solo novedad y solo oferta con el precio tachado', async ({ page }) => {
    await page.goto('/productos');
    const both = card(page, 'pienso-perro-adulto');
    await expect(both.locator('.product__tags .chip')).toHaveText(['Novedad', 'Oferta']);
    await expect(both.locator('.chip--amber')).toHaveText('Novedad');
    await expect(both.locator('.price s')).toHaveText('47,90 €');
    await expect(both.locator('.price .visually-hidden')).toHaveText('Antes 47,90 €, ahora 42,50 €');

    await expect(card(page, 'rascador-torre').locator('.product__tags .chip')).toHaveText(['Novedad']);
    const sale = card(page, 'cepillo-desenredante');
    await expect(sale.locator('.product__tags .chip')).toHaveText(['Oferta']);
    await expect(sale.locator('.price s')).toHaveText('13,90 €');
    await expect(sale.getByText('Antes 13,90 €, ahora 10,50 €')).toBeAttached();

    await expect(card(page, 'pienso-gato-esterilizado').locator('.product__tags')).toHaveCount(0);
    await axeCheck(page);
  });

  test('en la ficha', async ({ page }) => {
    await page.goto('/productos/pienso-perro-adulto');
    const info = page.locator('.detail__info');
    await expect(info.locator('.product__tags .chip')).toHaveText(['Novedad', 'Oferta']);
    await expect(info.locator('.price s')).toHaveText('47,90 €');
    await expect(info.getByText('Antes 47,90 €, ahora 42,50 €')).toBeAttached();
  });

  test.describe('con un precio anterior que no es mayor', () => {
    test.skip(({ isMobile, javaScriptEnabled }) => isMobile || !javaScriptEnabled, 'recarga contenido: basta con el proyecto desktop');
    test.afterAll(async () => {
      await loadPetcare();
    });

    test('no hay etiqueta de oferta ni tachado', async ({ page }) => {
      await loadPetcareVariant((c: Record<string, any>) => {
        const cepillo = c.shop.products.find((p: { slug: string }) => p.slug === 'cepillo-desenredante');
        cepillo.compare_at_price = '10.50';
      });
      await page.goto('/productos/cepillo-desenredante');
      await expect(page.locator('.detail__info .product__tags')).toHaveCount(0);
      await expect(page.locator('.detail__info .price s')).toHaveCount(0);
      await expect(page.locator('.detail__info .price')).toHaveText('10,50 €');
    });
  });
});
