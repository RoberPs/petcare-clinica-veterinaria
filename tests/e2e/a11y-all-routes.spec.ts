import type { Page } from '@playwright/test';
import { createCustomer, createPet, insertOrder, loadPetcare, query, resetAccountState, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, loginAs, test } from './fixtures';

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

// Feature 005 (T101): todas las rutas de la tienda en los tres perfiles, con axe y sin scroll
// horizontal. Las URL firmadas (pago, confirmación y enlace de invitado) salen del propio recorrido.
async function checkRoute(page: Page, label: string) {
  await axeCheck(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `scroll horizontal en ${label}`).toBeLessThanOrEqual(0);
}

test.describe('accesibilidad de la tienda (feature 005)', () => {
  const BUYER = 'a11y-tienda@example.test';
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async () => {
    await resetShopState();
    await resetAccountState();
    await fakeEmails.clear();
    await query(`UPDATE products SET stock = 14 WHERE slug = 'pienso-perro-adulto'`);
  });
  test.afterAll(async () => {
    await resetShopState();
  });

  test('carrito, checkout, pago simulado, pago no completado, confirmación y enlace de invitado', async ({ page }) => {
    await page.goto('/carrito');
    await dismissCookies(page);
    await checkRoute(page, 'carrito vacío');
    await page.goto('/condiciones-de-venta');
    await checkRoute(page, '/condiciones-de-venta');

    await page.goto('/productos/pienso-perro-adulto');
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await expect(page).toHaveURL(/aviso=carrito-/);
    await page.goto('/carrito');
    await checkRoute(page, 'carrito lleno');
    await page.goto('/finalizar-compra');
    await checkRoute(page, '/finalizar-compra');

    await page.getByLabel('Correo electrónico', { exact: true }).fill(BUYER);
    await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
    await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
    await page.getByLabel('Dirección', { exact: true }).fill('Calle de la Prueba 3');
    await page.getByLabel('Código postal', { exact: true }).fill('28001');
    await page.getByLabel('Ciudad', { exact: true }).fill('Madrid');
    await page.waitForTimeout(3_200);
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();
    await expect(page).toHaveURL(/\/pago-simulado\//);
    await checkRoute(page, '/pago-simulado');

    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page).toHaveURL(/\/pedido\/pago-no-completado/);
    await checkRoute(page, '/pedido/pago-no-completado');
    await page.getByRole('button', { name: 'Reintentar pago' }).click();
    await page.getByRole('button', { name: 'Pagar' }).click();
    await expect(page).toHaveURL(/\/pedido\/confirmado/);
    await checkRoute(page, '/pedido/confirmado');

    let path: string | undefined;
    for (let i = 0; i < 50 && !path; i++) {
      const mail = (await fakeEmails.to(BUYER)).find((e) => /confirmado$/.test(e.body.subject ?? ''));
      path = (mail?.body.textContent ?? '').match(/\/pedido\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
      if (!path) await page.waitForTimeout(200);
    }
    await page.goto(path!);
    await checkRoute(page, 'pedido de invitado');
    await query(`UPDATE orders SET last_status_at = now() - interval '400 days'`);
    await page.goto(path!);
    await expect(page.getByRole('heading', { level: 1, name: 'Este enlace ha caducado' })).toBeVisible();
    await checkRoute(page, 'pedido de invitado caducado');
  });

  test('"Mis pedidos" y su detalle', async ({ page }) => {
    const c = await createCustomer();
    await insertOrder({ number: 'PC-000901', customerId: c.id, status: 'pending_payment' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta/pedidos');
    await dismissCookies(page);
    await checkRoute(page, '/mi-cuenta/pedidos');
    await page.goto('/mi-cuenta/pedidos/PC-000901');
    await checkRoute(page, '/mi-cuenta/pedidos/PC-000901');
    await page.goto('/mi-cuenta/pedidos/PC-000901?cancelar=1');
    await checkRoute(page, 'confirmación de cancelar pedido');
  });
});
