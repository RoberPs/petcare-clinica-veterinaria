import { testEnv } from '../test-env';
import { axeCheck, expect, test } from './fixtures';

const SECTIONS: [string, string][] = [
  ['reservas', 'Pide cita'],
  ['cuenta', 'Mi cuenta'],
];

test.describe('Próximamente', () => {
  for (const [key, label] of SECTIONS) {
    test(`/proximamente/${key} nombra la sección y ofrece alternativas`, async ({ page }) => {
      await page.goto(`/proximamente/${key}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${label}: próximamente`);
      const main = page.getByRole('main');
      await expect(main.getByRole('link', { name: testEnv.CLINIC_PHONE_DISPLAY })).toHaveAttribute('href', `tel:${testEnv.CLINIC_PHONE_E164}`);
      await expect(main.getByRole('link', { name: 'Contacto', exact: true })).toHaveAttribute('href', '/contacto');
      await expect(main.getByRole('link', { name: 'Volver a la portada' })).toHaveAttribute('href', '/');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      if (key === 'reservas') await axeCheck(page);
    });
  }

  test('una clave desconocida da 404 con cabecera, pie y noindex', async ({ page }) => {
    const res = await page.goto('/proximamente/desconocida');
    expect(res!.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos esta página');
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
    const other = await page.goto('/no-existe');
    expect(other!.status()).toBe(404);
    await axeCheck(page);
  });
});
