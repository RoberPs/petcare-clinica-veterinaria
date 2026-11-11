import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, dismissCookies, expect, test } from './fixtures';

const yaml = parse(readFileSync('content/petcare.yaml', 'utf8')) as { services: { slug: string; name: string; description: string }[] };

test.describe('US3 · tratamientos', () => {
  test('los servicios en orden, con nombre y descripción, y los CTA finales', async ({ page }) => {
    await page.goto('/tratamientos');
    const items = page.locator('.service-list > li');
    await expect(items).toHaveCount(yaml.services.length);
    await expect(items.locator('h3')).toHaveText(yaml.services.map((s) => s.name));
    await expect(items.first().locator('p')).toHaveText(yaml.services[0]!.description);
    const band = page.locator('.band');
    await expect(band.getByRole('link', { name: 'Pide cita' })).toHaveAttribute('href', '/proximamente/reservas');
    await expect(band.getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', '/contacto');
    await dismissCookies(page);
    await band.getByRole('link', { name: 'Pide cita' }).click();
    await expect(page).toHaveURL(/\/proximamente\/reservas$/);
  });

  test('axe sin errores', async ({ page }) => {
    await page.goto('/tratamientos');
    await axeCheck(page);
  });

  test('un servicio despublicado no aparece y sin servicios sale el estado vacío', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'recarga contenido: basta con un proyecto');
    try {
      await loadPetcareVariant((c) => {
        c.services = (c.services as { slug: string }[]).filter((s) => s.slug !== 'salud-dental');
      });
      await page.goto('/tratamientos');
      await expect(page.locator('.service-list > li')).toHaveCount(yaml.services.length - 1);
      await expect(page.getByRole('heading', { name: 'Salud dental' })).toHaveCount(0);

      await loadPetcareVariant((c) => {
        c.services = [];
      });
      await page.goto('/tratamientos');
      await expect(page.locator('.service-list')).toHaveCount(0);
      await expect(page.getByText('Cuéntanos qué necesita tu mascota')).toBeVisible();
      await expect(page.locator('.empty-state').getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', '/contacto');
      await axeCheck(page);
    } finally {
      await loadPetcare();
    }
  });
});
