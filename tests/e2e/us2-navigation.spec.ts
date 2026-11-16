import { testEnv } from '../test-env';
import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

const MAIN = ['Tratamientos', 'La clínica', 'Nuestros productos', 'Consejos de salud', 'Preguntas frecuentes'];
const ROUTES = ['/', '/tratamientos', '/la-clinica', '/contacto', '/preguntas-frecuentes', '/privacidad', '/carrito'];

test.describe('US2 · cabecera y pie comunes', () => {
  test('orden de la cabecera (FR-003) en escritorio', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'navegación de escritorio');
    await page.goto('/tratamientos');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link')).toHaveText(MAIN);
    await expect(nav.getByRole('link', { name: 'Tratamientos' })).toHaveAttribute('aria-current', 'page');
    const cta = page.locator('.header-cta > a');
    await expect(cta).toHaveCount(4);
    await expect(cta.nth(0)).toHaveText('Mi cuenta');
    await expect(cta.nth(1)).toHaveText('Pide cita');
    await expect(cta.nth(2)).toHaveText('Contacto');
    // Desde la feature 005 el carrito está activo y lleva el número de unidades.
    await expect(cta.nth(3)).toHaveAttribute('aria-label', /^Carrito, \d+ productos?$/);
    // Desde la feature 002, "Mi cuenta" lleva al área personal (cuenta.href = /mi-cuenta).
    await expect(cta.nth(0)).toHaveAttribute('href', '/mi-cuenta');
    await expect(cta.nth(3)).toHaveAttribute('href', '/carrito');
    await axeCheck(page);
  });

  test('menú móvil: 5 secciones más Pide cita y Contacto, Escape y foco', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'menú de móvil');
    await page.goto('/la-clinica');
    await dismissCookies(page);
    const toggle = page.locator('summary.nav-toggle');
    await expect(toggle).toHaveText('Menú');
    await toggle.click();
    const panel = page.getByRole('navigation', { name: 'Menú' });
    await expect(panel).toBeVisible();
    for (const name of MAIN) await expect(panel.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Pide cita' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Contacto' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'La clínica' })).toHaveAttribute('aria-current', 'page');
    await axeCheck(page);

    if (isNoJs(info.project.name)) {
      await toggle.click();
      await expect(panel).toBeHidden();
      return;
    }
    // El foco recorre el menú y no se escapa (retención), Escape cierra y devuelve el foco a "Menú".
    await toggle.focus();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !!document.activeElement?.closest('details.mobile-nav'));
      expect(inside).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('pie: contacto, secciones, 4 legales y Configurar cookies; el skip link es el primer foco', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: testEnv.CLINIC_PHONE_DISPLAY })).toHaveAttribute('href', `tel:${testEnv.CLINIC_PHONE_E164}`);
    await expect(footer.getByText('Calle de la Demostración, 1')).toBeVisible();
    for (const [name, href] of [
      ['La clínica', '/la-clinica'],
      ['Tratamientos', '/tratamientos'],
      ['Contacto', '/contacto'],
      ['Preguntas frecuentes', '/preguntas-frecuentes'],
      ['Aviso legal', '/aviso-legal'],
      ['Política de privacidad', '/privacidad'],
      ['Política de cookies', '/politica-de-cookies'],
      ['Términos de uso', '/terminos'],
      ['Configurar cookies', '/cookies/configurar'],
    ]) {
      await expect(footer.getByRole('link', { name: name!, exact: true })).toHaveAttribute('href', href!);
    }
    await expect(footer.locator('.open-status')).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Saltar al contenido' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#contenido$/);
  });

  test('la franja de demostración está en todas las rutas y desaparece con demo_banner_enabled: false', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'recarga contenido: basta con un proyecto');
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByText('Web de demostración: PetCare es una clínica ficticia')).toBeVisible();
    }
    try {
      await loadPetcareVariant((c) => {
        (c.clinic as Record<string, unknown>).demo_banner_enabled = false;
      });
      await page.goto('/');
      await expect(page.getByText('Web de demostración')).toHaveCount(0);
    } finally {
      await loadPetcare();
    }
  });
});
