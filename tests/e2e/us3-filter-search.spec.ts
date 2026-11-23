import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

// US3 de la 006: pestañas de categoría y buscador (E4, E5).

test.describe('US3 · filtrar y buscar consejos', () => {
  test('la pestaña de categoría filtra en una lista combinada con etiqueta de tipo', async ({ page }) => {
    await page.goto('/consejos');
    await dismissCookies(page);
    const tabs = page.getByRole('navigation', { name: 'Categorías' });
    await expect(tabs.getByRole('link', { name: 'Todas' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'Gato' }).click();
    await expect(page).toHaveURL(/\/consejos\?categoria=gato$/);
    await expect(tabs.getByRole('link', { name: 'Gato' })).toHaveAttribute('aria-current', 'page');
    await expect(tabs.getByRole('link', { name: 'Todas' })).not.toHaveAttribute('aria-current', 'page');

    // 3 artículos + 1 noticia de gato.
    const cards = page.locator('.article-card');
    await expect(cards).toHaveCount(4);
    await expect(page.locator('#resultados-titulo')).toHaveText(/^4 resultados en Gato/);
    await expect(cards.first().locator('.badge')).toHaveText('Noticia');
    await expect(cards.filter({ hasText: 'cepillado dental' }).locator('.badge')).toHaveText('Artículo');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/consejos$/);
    await axeCheck(page);
  });

  test('busca sin tildes ni mayúsculas y combina con la categoría', async ({ page }) => {
    for (const term of ['baño', 'BANO']) {
      await page.goto('/consejos');
      await page.getByLabel('Busca datos y consejos entre nuestras publicaciones').fill(term);
      await page.getByRole('button', { name: 'Buscar' }).click();
      await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(term)}`));
      await expect(page.locator('.article-card').filter({ hasText: '¿Cada cuánto hay que bañar a un perro?' })).toHaveCount(1);
    }
    // La búsqueda se conserva al cambiar de pestaña y la categoría al buscar.
    await page.getByRole('navigation', { name: 'Categorías' }).getByRole('link', { name: 'Gato' }).click();
    await expect(page).toHaveURL(/categoria=gato&q=BANO/);
    await expect(page.getByLabel('Busca datos y consejos entre nuestras publicaciones')).toHaveValue('BANO');
  });

  test('sin resultados: mensaje anunciado y "Quitar filtros"', async ({ page }) => {
    await page.goto('/consejos?q=zzzz');
    const status = page.getByRole('status').filter({ hasText: 'No hay resultados' });
    await expect(status).toContainText('No hay resultados para «zzzz»');
    await status.getByRole('link', { name: 'Quitar filtros' }).click();
    await expect(page).toHaveURL(/\/consejos$/);
    await page.goto('/consejos?q=zzzz');
    await axeCheck(page);
  });

  test('una categoría desconocida se ignora', async ({ page }) => {
    await page.goto('/consejos?categoria=dragones');
    await expect(page.getByRole('heading', { level: 2, name: 'Artículos' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Categorías' }).getByRole('link', { name: 'Todas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('funciona sin JavaScript', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    await page.goto('/consejos');
    await page.getByLabel('Busca datos y consejos entre nuestras publicaciones').fill('gato');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/q=gato/);
    await expect(page.locator('.article-card').first()).toBeVisible();
    await page.getByRole('navigation', { name: 'Categorías' }).getByRole('link', { name: 'Perro' }).click();
    await expect(page).toHaveURL(/categoria=perro&q=gato/);
  });
});
