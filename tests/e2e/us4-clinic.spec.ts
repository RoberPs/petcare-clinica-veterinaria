import { testEnv } from '../test-env';
import { loadPetcare, loadPetcareVariant } from './db';
import { axeCheck, dismissCookies, expect, isNoJs, test } from './fixtures';

const isoInDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test.describe('US4 · la clínica', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://www.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="es"><title>Mapa</title></html>' }),
    );
  });

  test('dirección, horario de los 7 días, contacto y equipo', async ({ page }) => {
    await page.goto('/la-clinica');
    const main = page.getByRole('main');
    await expect(main.getByText('Calle de la Demostración, 1').first()).toBeVisible();
    const days = main.locator('dl.hours dt');
    await expect(days).toHaveText(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    await expect(main.locator('dl.hours dd').first()).toHaveText('09:30–14:00 y 16:30–20:00');
    await expect(main.locator('dl.hours dd').last()).toHaveText('Cerrado');
    await expect(main.getByRole('link', { name: testEnv.CLINIC_PHONE_DISPLAY })).toHaveAttribute('href', `tel:${testEnv.CLINIC_PHONE_E164}`);
    const members = main.locator('.team .member');
    await expect(members).toHaveCount(4);
    await expect(members.first().getByRole('img')).toHaveAttribute('alt', 'Retrato ilustrado de la Dra. Nerea Olmedo');
    await expect(members.first().getByRole('heading')).toHaveText('Dra. Nerea Olmedo');
    await expect(members.first()).toContainText('Medicina interna');
    await axeCheck(page);
  });

  test('"Cerrado ahora · abre el lunes…" un domingo (reloj simulado)', async ({ page }) => {
    const sunday = '2026-11-15T11:00:00+01:00';
    await page.clock.setFixedTime(new Date(sunday));
    await page.setExtraHTTPHeaders({ 'x-test-now': sunday });
    await page.goto('/la-clinica');
    await expect(page.getByRole('main').locator('.open-status')).toHaveText('Cerrado ahora · abre el lunes a las 09:30');
    const monday = '2026-11-16T10:00:00+01:00';
    await page.setExtraHTTPHeaders({ 'x-test-now': monday });
    await page.goto('/la-clinica');
    await expect(page.getByRole('main').locator('.open-status')).toHaveText('Abierto ahora · cierra a las 14:00');
  });

  test('sin consentimiento no hay peticiones a OpenStreetMap; tras aceptar aparece el mapa', async ({ page }) => {
    const osm: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('openstreetmap.org')) osm.push(r.url());
    });
    await page.goto('/la-clinica');
    const placeholder = page.locator('.map-placeholder');
    await expect(placeholder).toContainText('Calle de la Demostración, 1');
    await expect(placeholder.getByRole('link', { name: /Abrir en el mapa/ })).toHaveAttribute('href', /openstreetmap\.org\/\?mlat=/);
    expect(osm).toEqual([]);
    await dismissCookies(page);
    expect(osm).toEqual([]);
    await placeholder.getByRole('button', { name: 'Aceptar y ver el mapa' }).click();
    const frame = page.locator('iframe[src*="openstreetmap.org/export/embed.html"]');
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute('title', /Mapa de OpenStreetMap/);
    await expect(frame).toHaveAttribute('loading', 'lazy');
    await axeCheck(page, { exclude: ['iframe'] });
  });

  test('cierre próximo, foto de sustitución y correo público', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'recarga contenido: basta con un proyecto');
    try {
      await loadPetcareVariant((c) => {
        c.closures = [{ slug: 'cierre-prueba', starts_on: isoInDays(5), ends_on: isoInDays(7), reason: 'Formación del equipo' }];
        const clinic = c.clinic as Record<string, unknown>;
        clinic.public_email = 'hola@example.test';
        const team = c.team as Record<string, unknown>[];
        delete team[3]!.photo;
        delete team[3]!.photo_alt;
      });
      await page.goto('/la-clinica');
      const main = page.getByRole('main');
      await expect(main.locator('.closure-notice')).toContainText('(Formación del equipo)');
      await expect(main.locator('.closure-notice')).toContainText('Cerrado del');
      const placeholder = main.locator('.team .member').nth(3).getByRole('img');
      await expect(placeholder).toHaveAttribute('alt', 'Foto de Samuel Ortuño');
      await expect(placeholder).toHaveAttribute('src', /placeholder-persona/);
      await expect(main.getByRole('link', { name: 'hola@example.test' })).toHaveAttribute('href', 'mailto:hola@example.test');
      await page.goto('/contacto');
      await expect(page.getByRole('main').locator('.closure-notice')).toContainText('(Formación del equipo)');
    } finally {
      await loadPetcare();
    }
  });

  test('sin correo público no hay etiqueta vacía', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name), 'igual en todos los perfiles');
    await page.goto('/la-clinica');
    await dismissCookies(page);
    await expect(page.locator('a[href^="mailto:"]').filter({ hasNotText: testEnv.LEGAL_CONTACT_EMAIL })).toHaveCount(0);
  });
});
