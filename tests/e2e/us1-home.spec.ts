import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, dismissCookies, expect, test } from './fixtures';

test.describe('US1 · portada', () => {
  test('el titular y los 3 CTA se ven sin scroll en 360 px', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'comprobación de móvil');
    await page.goto('/');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    for (const name of ['Pide cita online', 'Contacto', 'Conoce la clínica']) {
      await expect(page.getByRole('main').getByRole('link', { name, exact: true })).toBeInViewport();
    }
  });

  const destinations: [string, RegExp][] = [
    ['Pide cita online', /\/pide-cita$/],
    ['Contacto', /\/contacto$/],
    ['Conoce la clínica', /\/la-clinica$/],
    ['Nuestros productos', /\/productos$/],
    ['Tratamientos y servicios', /\/tratamientos$/],
    ['Consejos de salud', /\/proximamente\/consejos$/],
  ];
  for (const [name, url] of destinations) {
    test(`"${name}" llega a su destino en un clic`, async ({ page }) => {
      await page.goto('/');
      await dismissCookies(page);
      await page.getByRole('main').getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(url);
    });
  }

  test('cifras del YAML, sin boletín y sin avisos de salud sin fuente; axe', async ({ page }) => {
    await page.goto('/');
    const stats = page.getByRole('region', { name: 'PetCare en cifras' });
    await expect(stats.getByRole('heading', { name: '+3.200 visitas al año' })).toBeVisible();
    await expect(stats.getByRole('heading', { name: '4 personas en el equipo' })).toBeVisible();
    await expect(page.locator('main input[type="email"]')).toHaveCount(0);
    await expect(page.getByText(/boletín/i)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Avisos de salud' })).toHaveCount(0);
    await axeCheck(page);
  });

  test('un aviso de salud con fuente aparece junto a la cita de su fuente', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'recarga contenido: basta con un proyecto');
    try {
      await loadPetcareVariant((c) => {
        c.health_notices = [
          {
            slug: 'aviso-prueba',
            text: 'Aviso sanitario de prueba con fuente.',
            source_label: 'Fuente de prueba',
            source_url: 'https://example.org/fuente',
          },
        ];
      });
      await page.goto('/');
      const notices = page.getByRole('region', { name: 'Avisos de salud' });
      await expect(notices.getByText('Aviso sanitario de prueba con fuente.')).toBeVisible();
      await expect(notices.getByRole('link', { name: 'Fuente de prueba' })).toHaveAttribute('href', 'https://example.org/fuente');
      await axeCheck(page);
    } finally {
      await loadPetcare();
    }
  });
});
