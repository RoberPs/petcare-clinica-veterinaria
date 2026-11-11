import { createCustomer, createPet, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, loginAs, test } from './fixtures';

// US4 · resumen del área personal.

test.describe('US4 · resumen', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('saludo con el nombre real, mascotas con especie y edad, y accesos', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Lucía' });
    await createPet(c.id, { name: 'Bruno', speciesKey: 'perro', birthDate: '2020-01-01' });
    await createPet(c.id, { name: 'Pío', speciesKey: null, birthDate: '2024-01-01' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta');
    await dismissCookies(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Lucía' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Mi cuenta' });
    await expect(nav.getByRole('link', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Mis citas' })).toHaveAttribute('href', '/proximamente/reservas');
    await expect(nav.getByRole('link', { name: 'Mis pedidos' })).toHaveAttribute('href', '/proximamente/tienda');

    const cards = page.locator('ul.pets > li.pet:not(.pet--add)');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(/Bruno.*Perro · \d+ años/s);
    await expect(cards.nth(1)).toContainText(/Pío.*Otra · \d+ (año|años)/s);
    await expect(page.getByRole('link', { name: 'Pedir cita para Bruno' })).toHaveAttribute('href', '/proximamente/reservas');
    await expect(page.getByRole('link', { name: 'Añadir mascota' })).toHaveAttribute('href', '/mi-cuenta/mascotas/nueva');
    // No hay bloque de pedidos (la tienda llegará en otra feature).
    await expect(page.getByText('Últimos pedidos')).toHaveCount(0);
    await axeCheck(page);

    await nav.getByRole('link', { name: 'Mis citas' }).click();
    await expect(page).toHaveURL(/\/proximamente\/reservas$/);
  });

  test('sin mascotas muestra el estado vacío con "Añadir mascota"', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Mario' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Mario' })).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('Aún no has añadido ninguna mascota');
    await expect(page.locator('.empty-state').getByRole('link', { name: 'Añadir mascota' })).toHaveAttribute('href', '/mi-cuenta/mascotas/nueva');
    await axeCheck(page);
  });
});
