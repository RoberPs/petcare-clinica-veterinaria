import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

test.describe('US4 · búsqueda por nombre', () => {
  test('"champu" encuentra el champú sin distinguir tildes', async ({ page }) => {
    await page.goto('/productos');
    await dismissCookies(page);
    const search = page.getByRole('searchbox', { name: 'Buscar producto' });
    await search.fill('champu');
    await search.press('Enter');
    await expect(page).toHaveURL(/[?&]q=champu/);
    await expect(page.locator('#resultados')).toHaveText('1 producto para «champu»');
    await expect(page.locator('.product h3')).toHaveText(['Champú para piel sensible 250 ml']);
    await expect(search).toHaveValue('champu');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('sin resultados lo dice con el término y ofrece todo el catálogo', async ({ page }) => {
    await page.goto('/productos?q=zzz');
    await expect(page.locator('#resultados')).toHaveText('No hay productos que coincidan para «zzz»');
    const empty = page.locator('.empty-state');
    await expect(empty).toContainText('No hemos encontrado productos para «zzz»');
    await expect(empty.getByRole('link', { name: 'Ver todo el catálogo' })).toHaveAttribute('href', '/productos');
    await axeCheck(page);
  });

  test('una búsqueda solo con espacios lista todo', async ({ page }) => {
    await page.goto('/productos?q=%20%20%20');
    await expect(page.locator('#resultados')).toHaveText('24 productos');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test('la búsqueda se conserva al ordenar y al paginar', async ({ page }) => {
    await page.goto('/productos?q=para');
    const filters = page.getByRole('complementary', { name: 'Filtros' });
    await filters.getByLabel('Ordenar por').selectOption('precio-desc');
    await filters.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page).toHaveURL(/q=para/);
    await expect(page).toHaveURL(/orden=precio-desc/);
    const next = page.getByRole('navigation', { name: 'Paginación' }).getByRole('link', { name: 'Siguiente' });
    await expect(next).toHaveAttribute('href', /q=para.*orden=precio-desc.*pagina=2/);
  });

  test('el término se muestra escapado', async ({ page }) => {
    await page.goto('/productos?q=%3Cb%3Ehola%3C%2Fb%3E');
    await expect(page.locator('#resultados')).toContainText('«<b>hola</b>»');
    await expect(page.locator('#resultados b')).toHaveCount(0);
  });

  test('sin JavaScript funciona con Intro', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    await page.goto('/productos?mascota=gato');
    const search = page.getByRole('searchbox', { name: 'Buscar producto' });
    await search.fill('pienso');
    await search.press('Enter');
    await expect(page.locator('.product h3')).toHaveText(['Pienso para gato esterilizado 3 kg']);
  });
});
