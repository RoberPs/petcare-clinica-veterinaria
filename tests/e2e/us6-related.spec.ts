import { loadPetcare, loadPetcareVariant } from './db';
import { dismissCookies, expect, test } from './fixtures';

test.describe('US6 · También te puede interesar', () => {
  test('hasta 3 tarjetas relacionadas, sin el producto actual, que abren su ficha', async ({ page }) => {
    await page.goto('/productos/pienso-perro-adulto');
    await dismissCookies(page);
    const related = page.locator('section[aria-labelledby="relacionados"]');
    await expect(related.getByRole('heading', { level: 2 })).toHaveText('También te puede interesar');
    const cards = related.locator('article.product');
    await expect(cards).toHaveCount(3);
    await expect(related.locator('a[href="/productos/pienso-perro-adulto"]')).toHaveCount(0);
    await expect(cards.locator('h3')).toHaveText([
      'Pienso para gato esterilizado 3 kg',
      'Sobres de comida húmeda para gato, 12 unidades',
      'Heno natural para conejos 1 kg',
    ]);
    await cards.first().getByRole('link').click();
    await expect(page).toHaveURL(/\/productos\/pienso-gato-esterilizado$/);
  });

  test.describe('sin relacionados', () => {
    test.skip(({ isMobile, javaScriptEnabled }) => isMobile || !javaScriptEnabled, 'recarga contenido: basta con el proyecto desktop');
    test.afterAll(async () => {
      await loadPetcare();
    });

    test('la sección no aparece', async ({ page }) => {
      await loadPetcareVariant((c: Record<string, any>) => {
        c.shop.categories.push({ slug: 'unica', name: 'Única' });
        c.shop.pets.push({ slug: 'exotico', name: 'Exótico' });
        const p = c.shop.products.find((x: { slug: string }) => x.slug === 'bebedero-roedores');
        p.category = 'unica';
        p.pets = ['exotico'];
      });
      await page.goto('/productos/bebedero-roedores');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('También te puede interesar')).toHaveCount(0);
    });
  });
});
