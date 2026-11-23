import type { Page } from '@playwright/test';
import { todayInClinicZone } from '../../src/domain/pet-age';
import { createCustomer, createPet, query, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, loginAs, test } from './fixtures';

// US3 · gestionar mis mascotas (también sin JavaScript).

const today = () => todayInClinicZone(new Date());
const yearsMonthsAgo = (years: number, months: number) => today().subtract({ years, months }).toString();

async function fillPet(page: Page, name: string, species: string, birthDate: string) {
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Especie').selectOption({ label: species });
  await page.getByLabel('Fecha de nacimiento').fill(birthDate);
}

test.describe('US3 · mis mascotas', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('estado vacío, añadir dos mascotas y ver su edad', async ({ page }) => {
    const c = await createCustomer();
    await loginAs(page, c);
    await page.goto('/mi-cuenta/mascotas');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { name: 'Aún no has añadido ninguna mascota' })).toBeVisible();
    await axeCheck(page);

    await page.getByRole('link', { name: 'Añadir mascota' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/mascotas\/nueva$/);
    await expect(page.getByText('Si no la sabes con exactitud, pon una aproximada.')).toBeVisible();
    await expect(page.getByLabel('Fecha de nacimiento')).toHaveAttribute('max', today().toString());
    await axeCheck(page);
    await fillPet(page, 'Bruno', 'Perro', yearsMonthsAgo(4, 3));
    await page.getByRole('button', { name: 'Añadir mascota' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/mascotas\?aviso=mascota-anadida$/);
    await expect(page.getByRole('status')).toContainText('Hemos añadido a tu mascota.');

    await page.goto('/mi-cuenta/mascotas/nueva');
    await fillPet(page, 'Pelusa', 'Otra', yearsMonthsAgo(0, 5));
    await page.getByRole('button', { name: 'Añadir mascota' }).click();
    await expect(page).toHaveURL(/aviso=mascota-anadida$/);

    const cards = page.locator('ul.pets > li.pet:not(.pet--add)');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Bruno');
    await expect(cards.nth(0)).toContainText('Perro · 4 años');
    await expect(cards.nth(1)).toContainText('Otra · 5 meses');
    await expect(cards.nth(0).getByRole('link', { name: 'Pedir cita para Bruno' })).toHaveAttribute('href', /^\/pide-cita\?mascota=[0-9a-f-]{36}$/);
    await axeCheck(page);
  });

  test('una fecha futura da el error junto al campo y conserva los datos', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'sin JavaScript, el navegador impide enviar una fecha mayor que max');
    const c = await createCustomer();
    await loginAs(page, c);
    await page.goto('/mi-cuenta/mascotas/nueva');
    await dismissCookies(page);
    await fillPet(page, 'Futuro', 'Gato', today().add({ days: 3 }).toString());
    await page.getByRole('button', { name: 'Añadir mascota' }).click();
    await expect(page.locator('#birth_date-error')).toHaveText('La fecha no puede ser futura.');
    await expect(page.getByLabel('Nombre')).toHaveValue('Futuro');
    await expect(page.getByLabel('Especie')).toHaveValue('gato');
  });

  test('editar una mascota y ver el cambio con el aviso', async ({ page }) => {
    const c = await createCustomer();
    const pet = await createPet(c.id, { name: 'Toby', speciesKey: 'perro', birthDate: '2020-05-05' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta/mascotas');
    await dismissCookies(page);
    await page.getByRole('link', { name: 'Editar a Toby' }).click();
    await expect(page).toHaveURL(new RegExp(`/mi-cuenta/mascotas/${pet.id}/editar$`));
    await expect(page.getByLabel('Nombre')).toHaveValue('Toby');
    await expect(page.getByLabel('Especie')).toHaveValue('perro');
    await axeCheck(page);
    await page.getByLabel('Nombre').fill('Toby Segundo');
    await page.getByLabel('Especie').selectOption({ label: 'Hurón' });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL(/aviso=mascota-guardada$/);
    await expect(page.getByRole('status')).toContainText('Hemos guardado los cambios');
    await expect(page.locator('ul.pets')).toContainText('Toby Segundo');
    await expect(page.locator('ul.pets')).toContainText('Hurón');
  });

  test('eliminar con la página de confirmación que nombra a la mascota', async ({ page }) => {
    const c = await createCustomer();
    await createPet(c.id, { name: 'Nube', speciesKey: 'gato' });
    await loginAs(page, c);
    await page.goto('/mi-cuenta/mascotas');
    await dismissCookies(page);
    await page.getByRole('link', { name: 'Eliminar a Nube' }).click();
    await expect(page.getByRole('heading', { name: '¿Eliminar a Nube?' })).toBeVisible();
    await expect(page.getByText('No se puede deshacer.')).toBeVisible();
    await axeCheck(page);
    await page.getByRole('button', { name: 'Eliminar a Nube' }).click();
    await expect(page).toHaveURL(/aviso=mascota-eliminada$/);
    await expect(page.getByRole('heading', { name: 'Aún no has añadido ninguna mascota' })).toBeVisible();
    expect(await query('SELECT id FROM pets WHERE customer_id = $1', [c.id])).toEqual([]);
  });

  test('la mascota de otro cliente da 404 al editarla o eliminarla', async ({ page }) => {
    const a = await createCustomer();
    const b = await createCustomer();
    const pet = await createPet(a.id, { name: 'Ajena' });
    await loginAs(page, b);
    for (const path of [`/mi-cuenta/mascotas/${pet.id}/editar`, `/mi-cuenta/mascotas/${pet.id}/eliminar`, '/mi-cuenta/mascotas/no-es-un-id/editar']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page).toHaveURL(/\/mi-cuenta\/mascota-no-encontrada$/);
      await expect(page.getByRole('heading', { level: 1, name: 'No encontramos esta página' })).toBeVisible();
      await expect(page.getByText('Ajena')).toHaveCount(0);
    }
    expect(await query('SELECT name FROM pets WHERE id = $1', [pet.id])).toEqual([{ name: 'Ajena' }]);
  });
});
