import { testEnv } from '../test-env';
import { axeCheck, dismissCookies, expect, test } from './fixtures';

// Los cuatro textos se actualizaron con la feature 005 (compra, pago y cookie del carrito, D19).
const PAGES: [string, string, string, string][] = [
  ['Aviso legal', '/aviso-legal', 'Aviso legal', '12 de noviembre de 2026'],
  ['Política de privacidad', '/privacidad', 'Política de privacidad', '12 de noviembre de 2026'],
  ['Política de cookies', '/politica-de-cookies', 'Política de cookies', '12 de noviembre de 2026'],
  ['Términos de uso', '/terminos', 'Términos de uso', '12 de noviembre de 2026'],
];

test.describe('US8 · páginas legales', () => {
  for (const [link, path, title, updated] of PAGES) {
    test(`"${link}" desde el pie lleva a su página con título y fecha`, async ({ page }) => {
      await page.goto('/');
      await dismissCookies(page);
      await page.getByRole('contentinfo').getByRole('link', { name: link, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.getByText(`Última actualización: ${updated}`)).toBeVisible();
      await expect(page.getByRole('main')).toContainText(testEnv.LEGAL_OWNER_NAME!);
      await expect(page.getByRole('main')).toContainText('ficticia');
      await expect(page.getByRole('main')).not.toContainText(/\bNIF\s*:/);
      if (path === '/aviso-legal') {
        await expect(page.getByRole('main').getByRole('link', { name: testEnv.LEGAL_CONTACT_EMAIL! })).toHaveAttribute(
          'href',
          `mailto:${testEnv.LEGAL_CONTACT_EMAIL}`,
        );
        await axeCheck(page);
      }
    });
  }

  test('los enlaces del formulario y del aviso de cookies llevan a las mismas páginas', async ({ page }) => {
    await page.goto('/contacto');
    await expect(page.getByRole('region', { name: 'Aviso de cookies' }).getByRole('link', { name: 'Política de cookies' })).toHaveAttribute(
      'href',
      '/politica-de-cookies',
    );
    await expect(page.locator('form').getByRole('link', { name: 'política de privacidad', exact: true })).toHaveAttribute('href', '/privacidad');
  });
});
