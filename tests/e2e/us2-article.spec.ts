import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

// US2 de la 006: detalle de una publicación (contracts/routes.md, E6).

test.describe('US2 · leer un artículo', () => {
  test('muestra migas, categoría, fecha, preámbulo, imagen, secciones y "Pide cita"', async ({ page }) => {
    await page.goto('/consejos/cada-cuanto-banar-perro');
    await dismissCookies(page);
    const crumbs = page.getByRole('navigation', { name: 'Migas de pan' });
    await expect(crumbs.getByRole('link', { name: 'Página de inicio' })).toHaveAttribute('href', '/');
    await expect(crumbs.getByRole('link', { name: 'Consejos de salud' })).toHaveAttribute('href', '/consejos');
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('¿Cada cuánto hay que bañar a un perro?');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Cada cuánto hay que bañar a un perro?');
    await expect(page.locator('.article-meta a.chip')).toHaveText('Perro');
    await expect(page.locator('.article-meta a.chip')).toHaveAttribute('href', '/consejos?categoria=perro');
    await expect(page.locator('.article-meta time')).toHaveAttribute('datetime', '2026-10-02');
    await expect(page.locator('.article-meta time')).toHaveText('2 de octubre de 2026');
    await expect(page.locator('.page-hero .preamble')).not.toBeEmpty();
    await expect(page.locator('.article-hero__img img')).not.toHaveAttribute('alt', '');
    expect(await page.locator('.prose h2').count()).toBeGreaterThan(1);

    const cta = page.locator('.cta-box');
    await expect(cta.getByRole('heading', { name: 'Ponte en contacto con un veterinario' })).toBeVisible();
    await expect(cta.getByRole('link', { name: 'Pide cita' })).toHaveAttribute('href', '/pide-cita');
    await expect(cta.getByRole('link', { name: 'Pide cita' })).toHaveClass(/btn--sky/);
    await axeCheck(page);
  });

  test('metadatos propios con la imagen de la publicación', async ({ page }) => {
    await page.goto('/consejos/cada-cuanto-banar-perro');
    await expect(page).toHaveTitle(/¿Cada cuánto hay que bañar a un perro\?/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', '¿Cada cuánto hay que bañar a un perro?');
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/media\/petcare\/consejos\//);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute('content', /^2026-10-0/);
  });

  test('sin imagen: marcador decorativo y og:image de la clínica', async ({ page }) => {
    await page.goto('/consejos/arena-gato-consejos');
    await expect(page.locator('.article-hero__img img')).toHaveAttribute('alt', '');
    await expect(page.locator('.article-hero__img img')).toHaveAttribute('src', /placeholder-articulo/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/media\//);
    await axeCheck(page);
  });

  test('una noticia sin categoría muestra "General" sin enlace', async ({ page }) => {
    await page.goto('/consejos/nuevo-boletin-de-consejos');
    await expect(page.locator('.article-meta .chip')).toHaveText('General');
    await expect(page.locator('.article-meta a.chip')).toHaveCount(0);
  });

  test('404 para un slug inexistente y para una publicación futura', async ({ page }) => {
    for (const slug of ['no-existe', 'hamster-jaula']) {
      const res = await page.goto(`/consejos/${slug}`);
      expect(res!.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos esta página');
    }
  });

  test('sin JavaScript se lee igual', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    await page.goto('/consejos');
    await page.locator('.article-card__link').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Cada cuánto hay que bañar a un perro?');
    expect((await page.goto('/consejos/hamster-jaula'))!.status()).toBe(404);
  });
});
