import { axeCheck, dismissCookies, expect, test } from './fixtures';

// SC-006: axe en todas las rutas de contracts/routes.md, reflow sin scroll horizontal y movimiento reducido.
const ROUTES = [
  '/',
  '/tratamientos',
  '/la-clinica',
  '/contacto',
  '/contacto/enviado',
  '/preguntas-frecuentes',
  '/cookies/configurar',
  '/aviso-legal',
  '/privacidad',
  '/politica-de-cookies',
  '/terminos',
  '/proximamente/reservas',
  '/no-existe',
];

test.describe('accesibilidad en todas las rutas', () => {
  for (const route of ROUTES) {
    test(`axe sin errores en ${route}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile-360', 'una pasada completa basta (las historias ya usan axe en todos los perfiles)');
      await page.goto(route);
      await axeCheck(page);
      await dismissCookies(page);
      await axeCheck(page);
    });
  }

  test('zoom al 200 % (320 px CSS, criterio 1.4.10) sin scroll horizontal', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `scroll horizontal en ${route}`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });

  test('con prefers-reduced-motion no hay transiciones ni animaciones', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const duration = await page.locator('.btn').first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((d) => parseFloat(d) <= 0.0001)).toBe(true);
    await context.close();
  });
});
