import { createCustomer, createPet, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, loginAs, test } from './fixtures';

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
  '/productos',
  '/productos?mascota=gato&categoria=higiene',
  '/productos?q=zzz',
  '/productos/pienso-perro-adulto',
  '/productos/arena-aglomerante-gato',
  '/no-existe',
  // Feature 002: cuenta y autenticación (sin sesión).
  '/crear-cuenta',
  '/crear-cuenta/revisa-tu-correo',
  '/verificar-correo',
  '/iniciar-sesion',
  '/recuperar-contrasena',
  '/recuperar-contrasena/enviado',
  '/restablecer-contrasena',
];

// Área personal: se recorre con una sesión creada en la base de datos (loginAs).
const PRIVATE_ROUTES = ['/mi-cuenta', '/mi-cuenta/mascotas', '/mi-cuenta/mascotas/nueva', '/mi-cuenta/datos', '/mi-cuenta/eliminar-cuenta'];

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

test.describe('accesibilidad del área personal (feature 002)', () => {
  test('axe sin errores y sin scroll horizontal a 320 px en todas las rutas privadas', async ({ browser }, info) => {
    test.skip(info.project.name !== 'mobile-360', 'una pasada completa basta');
    await resetAccountState();
    const c = await createCustomer({ firstName: 'Lucía' });
    const pet = await createPet(c.id, { name: 'Bruno' });
    const routes = [...PRIVATE_ROUTES, `/mi-cuenta/mascotas/${pet.id}/editar`, `/mi-cuenta/mascotas/${pet.id}/eliminar`];

    const context = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await loginAs(page, c);
    for (const route of routes) {
      await page.goto(route);
      await expect(page, route).toHaveURL(new RegExp(`${route}$`));
      await dismissCookies(page);
      await axeCheck(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `scroll horizontal en ${route}`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
