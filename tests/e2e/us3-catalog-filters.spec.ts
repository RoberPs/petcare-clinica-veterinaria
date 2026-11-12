import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

const names = (page: import('@playwright/test').Page) => page.locator('.product h3').allTextContents();

test.describe('US3 · filtros y orden', () => {
  test('Gato + Higiene + precio ascendente, con la URL compartible y el foco en el total', async ({ page }) => {
    await page.goto('/productos');
    await dismissCookies(page);
    const filters = page.getByRole('complementary', { name: 'Filtros' });
    await filters.getByRole('group', { name: 'Mascota' }).getByLabel('Gato').check();
    await filters.getByRole('group', { name: 'Mascota' }).getByLabel('Otros animales').check();
    await filters.getByRole('group', { name: 'Categoría' }).getByLabel('Higiene').check();
    await filters.getByLabel('Ordenar por').selectOption('precio-asc');
    // Cambiar un filtro no envía nada (WCAG 3.2.2).
    await expect(page).toHaveURL(/\/productos$/);
    await filters.getByRole('button', { name: 'Aplicar' }).click();

    // Sin JavaScript el formulario envía también el buscador vacío (q=).
    await expect(page).toHaveURL(/\/productos\?(q=&)?mascota=gato&mascota=otros&categoria=higiene&orden=precio-asc#resultados$/);
    await expect(page.locator('#resultados')).toHaveText('4 productos');
    await expect(page.locator('#resultados:target')).toHaveCount(1);
    await expect(page.locator('#resultados')).toBeInViewport();
    expect(await names(page)).toEqual([
      'Toallitas de limpieza para mascotas',
      'Cepillo desenredante',
      'Arena aglomerante para gato 10 l',
      'Champú para piel sensible 250 ml',
    ]);
    // Los valores aplicados quedan marcados.
    await expect(filters.getByLabel('Gato')).toBeChecked();
    await expect(filters.getByLabel('Higiene')).toBeChecked();
    await expect(filters.getByLabel('Ordenar por')).toHaveValue('precio-asc');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/productos$/);
    await axeCheck(page);

    // Abrir la misma URL da el mismo resultado.
    await page.goto('/productos?mascota=gato&mascota=otros&categoria=higiene&orden=precio-asc');
    await expect(page.locator('#resultados')).toHaveText('4 productos');
    expect((await names(page))[0]).toBe('Toallitas de limpieza para mascotas');
  });

  test('"Todas" quita la categoría', async ({ page }) => {
    await page.goto('/productos?categoria=higiene');
    const filters = page.getByRole('complementary', { name: 'Filtros' });
    await expect(filters.getByLabel('Higiene')).toBeChecked();
    await filters.getByLabel('Todas').check();
    await filters.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.locator('#resultados')).toHaveText('24 productos');
  });

  test('una combinación vacía lo dice y ofrece todo el catálogo', async ({ page }) => {
    await page.goto('/productos?mascota=otros&categoria=higiene');
    await expect(page.locator('#resultados')).toHaveText('No hay productos que coincidan');
    const empty = page.locator('.empty-state');
    await empty.getByRole('link', { name: 'Ver todo el catálogo' }).click();
    await expect(page).toHaveURL(/\/productos$/);
    await expect(page.locator('#resultados')).toHaveText('24 productos');
  });

  test('los parámetros manipulados no dan error', async ({ page }) => {
    const res = await page.goto('/productos?mascota=dragon&orden=x&pagina=999');
    expect(res!.status()).toBe(200);
    await expect(page.locator('#resultados')).toHaveText('24 productos');
    await expect(page.getByLabel('Ordenar por')).toHaveValue('destacados');
    await expect(page.getByRole('navigation', { name: 'Paginación' }).getByRole('link', { name: 'Página 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('la paginación conserva los filtros', async ({ page }) => {
    await page.goto('/productos?mascota=gato');
    await expect(page.locator('#resultados')).toHaveText('14 productos');
    const next = page.getByRole('navigation', { name: 'Paginación' }).getByRole('link', { name: 'Siguiente' });
    await expect(next).toHaveAttribute('href', '/productos?mascota=gato&pagina=2');
    await next.click();
    await expect(page.locator('.product')).toHaveCount(2);
    await expect(page.getByRole('complementary', { name: 'Filtros' }).getByLabel('Gato')).toBeChecked();
  });

  test('sin JavaScript se aplica con el botón', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    await page.goto('/productos');
    const filters = page.getByRole('complementary', { name: 'Filtros' });
    await filters.getByLabel('Perro').check();
    await filters.getByLabel('Accesorios').check();
    await filters.getByLabel('Ordenar por').selectOption('precio-desc');
    await filters.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page).toHaveURL(/mascota=perro&categoria=accesorios&orden=precio-desc/);
    expect(await names(page)).toEqual(['Cama acolchada lavable', 'Comedero doble de acero', 'Correa ajustable de nailon']);
  });
});
