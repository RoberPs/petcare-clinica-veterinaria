import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

test.describe('US6 · preguntas frecuentes', () => {
  test('grupos en el orden del YAML, enlaces de sección y CTA a Contacto', async ({ page }) => {
    await page.goto('/preguntas-frecuentes');
    await expect(page.locator('.faq > section > h2')).toHaveText(['Citas', 'Tienda', 'Tu mascota']);
    await expect(page.getByRole('navigation', { name: 'Migas de pan' }).getByRole('link')).toHaveAttribute('href', '/');
    const item = page.locator('details.faq__item', { hasText: '¿Vendéis piensos y antiparasitarios?' });
    await dismissCookies(page);
    await item.locator('summary').click();
    await expect(item.getByRole('link', { name: 'Nuestros productos' })).toHaveAttribute('href', '/proximamente/tienda');
    await item.getByRole('link', { name: 'Nuestros productos' }).click();
    await expect(page).toHaveURL(/\/proximamente\/tienda$/);
    await page.goBack();
    await expect(page.locator('.cta-box').getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', '/contacto');
    await axeCheck(page);
  });

  test('cada pregunta se despliega con clic, Enter y Espacio', async ({ page }, info) => {
    await page.goto('/preguntas-frecuentes');
    await dismissCookies(page);
    const item = page.locator('details.faq__item').first();
    const summary = item.locator('summary');
    await summary.click();
    await expect(item).toHaveAttribute('open', '');
    await summary.click();
    await expect(item).not.toHaveAttribute('open', '');
    if (isNoJs(info.project.name)) return; // el teclado se prueba igual: es el <details> nativo
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(item).not.toHaveAttribute('open', '');
  });

  test('un tema sin preguntas publicadas no aparece', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'recarga contenido: basta con un proyecto');
    try {
      await loadPetcareVariant((c) => {
        const topics = c.faq_topics as { slug: string; faqs: unknown[] }[];
        topics.find((t) => t.slug === 'tienda')!.faqs = [];
      });
      await page.goto('/preguntas-frecuentes');
      await expect(page.locator('.faq > section > h2')).toHaveText(['Citas', 'Tu mascota']);
    } finally {
      await loadPetcare();
    }
  });
});
