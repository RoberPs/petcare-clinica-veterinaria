import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

type Content = Record<string, any>;

// US1 de la 006: listado de artículos y noticias (contracts/routes.md, E5).

test.describe('US1 · listado de consejos', () => {
  test('la cabecera lleva a /consejos con artículos y las 3 últimas noticias', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    const link = page.getByRole('banner').getByRole('link', { name: 'Consejos de salud' }).first();
    if (await link.isVisible()) {
      await expect(link).toHaveAttribute('href', '/consejos');
      await link.click();
    } else {
      await page.goto('/consejos');
    }
    await expect(page).toHaveURL(/\/consejos$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Consejos de salud');

    const articles = page.locator('ul.articles').first().locator('.article-card');
    await expect(page.getByRole('heading', { level: 2, name: 'Artículos' })).toBeVisible();
    // 8 artículos en el contenido, uno con fecha futura que no se muestra.
    await expect(articles).toHaveCount(7);
    await expect(articles.first().locator('h3')).toHaveText('¿Cada cuánto hay que bañar a un perro?');
    await expect(articles.first().locator('.chip')).toHaveText('Perro');
    await expect(articles.first().locator('.article-card__link')).toHaveAttribute('href', '/consejos/cada-cuanto-banar-perro');
    await expect(page.getByText('Cómo preparar la jaula de un hámster')).toHaveCount(0);
    // Sin imagen: marcador decorativo.
    const noImage = articles.filter({ hasText: 'El arenero ideal para tu gato' });
    await expect(noImage.locator('img')).toHaveAttribute('alt', '');
    await expect(noImage.locator('img')).toHaveAttribute('src', /placeholder-articulo/);

    const news = page.locator('ul.articles').nth(1).locator('.article-card');
    await expect(page.getByRole('heading', { level: 2, name: 'Noticias' })).toBeVisible();
    await expect(news).toHaveCount(3);
    await expect(news.first().locator('h3')).toHaveText('Lanzamos nuestro boletín de consejos');
    await expect(news.first().locator('.chip')).toHaveText('General');
    await expect(page.getByRole('link', { name: 'Ver todas las noticias' })).toHaveAttribute('href', '/consejos?tipo=noticias');
    await axeCheck(page);
  });

  test('la portada y el pie enlazan la sección', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main').locator('a.card[href="/consejos"]')).toHaveCount(1);
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Consejos de salud' })).toHaveAttribute('href', '/consejos');
  });

  test('"Ver todas las noticias" lista las 4 y permite volver', async ({ page }) => {
    await page.goto('/consejos');
    await page.getByRole('link', { name: 'Ver todas las noticias' }).click();
    await expect(page).toHaveURL(/\/consejos\?tipo=noticias$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Noticias' })).toBeVisible();
    await expect(page.locator('.article-card')).toHaveCount(4);
    await page.getByRole('link', { name: 'Volver a todos los consejos' }).click();
    await expect(page).toHaveURL(/\/consejos$/);
  });

  test('la tarjeta abre el artículo con el teclado', async ({ page }) => {
    await page.goto('/consejos');
    await dismissCookies(page);
    const first = page.locator('.article-card__link').first();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/consejos\/cada-cuanto-banar-perro$/);
  });

  test('el sitemap incluye la sección y las publicaciones visibles', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    expect(xml).toContain('/consejos</loc>');
    expect(xml).toContain('/consejos/cada-cuanto-banar-perro</loc>');
    expect(xml).not.toContain('/consejos/hamster-jaula');
  });

  test('funciona igual sin JavaScript', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    await page.goto('/consejos');
    await page.getByRole('link', { name: 'Ver todas las noticias' }).click();
    await expect(page.locator('.article-card')).toHaveCount(4);
  });

  test.describe('con otro contenido', () => {
    test.describe.configure({ mode: 'serial' });
    test.skip(({ isMobile, javaScriptEnabled }) => isMobile || !javaScriptEnabled, 'recarga contenido: basta con el proyecto desktop');
    test.afterAll(async () => {
      await loadPetcare();
    });

    test('pagina los artículos de 12 en 12', async ({ page }) => {
      await loadPetcareVariant((c: Content) => {
        const base = (c.posts as Content[]).find((p) => p.slug === 'cada-cuanto-banar-perro')!;
        for (let i = 1; i <= 10; i++) {
          (c.posts as Content[]).push({ ...base, slug: `extra-${i}`, title: `Artículo extra ${i}`, published_on: '2026-01-0' + ((i % 9) + 1) });
        }
      });
      await page.goto('/consejos');
      await expect(page.locator('ul.articles').first().locator('.article-card')).toHaveCount(12);
      const nav = page.getByRole('navigation', { name: 'Paginación' });
      await nav.getByRole('link', { name: 'Siguiente' }).click();
      await expect(page).toHaveURL(/\/consejos\?pagina=2#resultados$/);
      await expect(page.locator('ul.articles').first().locator('.article-card')).toHaveCount(5);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/consejos\?pagina=2$/);
    });

    test('un bloque vacío muestra su mensaje', async ({ page }) => {
      await loadPetcareVariant((c: Content) => {
        c.posts = (c.posts as Content[]).filter((p) => p.kind !== 'news');
      });
      await page.goto('/consejos');
      await expect(page.locator('.empty-state')).toHaveText('Todavía no hay noticias publicadas. Vuelve pronto.');
      await axeCheck(page);
    });

    test('con la sección desactivada, /consejos da 404', async ({ page }) => {
      await loadPetcareVariant((c: Content) => {
        c.sections = (c.sections as Content[]).map((s) => (s.key === 'consejos' ? { ...s, href: null } : s));
      });
      expect((await page.goto('/consejos'))!.status()).toBe(404);
      expect((await page.goto('/consejos/cada-cuanto-banar-perro'))!.status()).toBe(404);
    });
  });
});
