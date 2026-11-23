import type { Page } from '@playwright/test';
import { createCustomer, createPet, resetAccountState, resetBookingState } from './db';
import { axeCheck, BOOKING_NOW, dismissCookies, expect, fakeEmails, isNoJs, loginAs, test } from './fixtures';

// US2: reservar con sesión iniciada (FR-011, FR-012). Hora fija: lunes 16/11/2026 a las 09:00.

const TUESDAY = '2026-11-17';
const waitForToken = (page: Page) => page.waitForTimeout(3_200);

async function chooseServiceAndTime(page: Page, time: string) {
  await page.getByLabel('Tipo de servicio').selectOption('consulta-general');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(TUESDAY);
  await page.getByRole('button', { name: 'Ver horas' }).click();
  await page.getByRole('group', { name: 'Horas disponibles' }).getByRole('radio', { name: time }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

test.describe('US2: reservar con sesión iniciada', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
    await fakeEmails.clear();
  });

  test('"Pedir cita" desde una mascota la deja preelegida y los datos vienen de la cuenta', async ({ page }, info) => {
    const c = await createCustomer({ firstName: 'Lucía', lastName: 'Cliente', phone: '600 111 222', email: `lucia-${info.project.name}@example.test` });
    const bruno = await createPet(c.id, { name: 'Bruno' });
    await createPet(c.id, { name: 'Nuba', speciesKey: 'gato' });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/mi-cuenta/mascotas');
    await dismissCookies(page);
    await page.getByRole('link', { name: 'Pedir cita para Bruno' }).click();
    await expect(page).toHaveURL(new RegExp(`/pide-cita\\?mascota=${bruno.id}$`));
    await expect(page.getByRole('complementary', { name: 'Resumen de tu cita' })).toContainText('Bruno (Perro)');

    await chooseServiceAndTime(page, '10:00');
    await expect(page.getByLabel('Mascota', { exact: true })).toHaveValue(bruno.id);
    await expect(page.getByLabel('Nombre y apellidos')).toHaveValue('Lucía Cliente');
    await expect(page.getByLabel('Nombre y apellidos')).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(c.email);
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Teléfono')).toHaveValue('600 111 222');
    await expect(page.getByRole('link', { name: 'Inicia sesión' })).toHaveCount(0);
    await axeCheck(page);

    await page.getByRole('checkbox', { name: /acepto la política de privacidad/ }).check();
    await waitForToken(page);
    await page.getByRole('button', { name: 'Confirmar cita' }).click();
    await expect(page).toHaveURL(/\/pide-cita\/confirmada\?ref=/);
    await expect(page.getByRole('status')).toContainText('Bruno (Perro)');
    await expect(page.getByRole('link', { name: 'Ver mis citas' })).toHaveAttribute('href', '/mi-cuenta/citas');
    await axeCheck(page);

    // El correo de confirmación lleva la variante de cliente.
    await expect.poll(async () => (await fakeEmails.to(c.email)).length).toBeGreaterThan(0);
    const [mail] = await fakeEmails.to(c.email);
    expect(mail!.body.textContent).toContain('Puedes cancelarla o cambiarla desde Mis citas');
    expect(mail!.body.textContent).toContain('/mi-cuenta/citas');
  });

  test('"Otra mascota…" pide los datos de la 002 y la mascota aparece después en Mis mascotas', async ({ page }, info) => {
    const c = await createCustomer({ phone: null, email: `otra-${info.project.name}@example.test` });
    await createPet(c.id, { name: 'Bruno' });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/pide-cita');
    await dismissCookies(page);
    await chooseServiceAndTime(page, '11:00');

    if (isNoJs(info.project.name)) {
      await page.getByRole('link', { name: 'Añade sus datos' }).click();
      await expect(page).toHaveURL(/mascota=otra/);
    } else {
      await page.getByLabel('Mascota', { exact: true }).selectOption('otra');
    }
    await page.getByLabel('Nombre de la mascota nueva').fill('Kiwi');
    await page.getByLabel('Especie').selectOption({ label: 'Gato' });
    await page.getByLabel('Fecha de nacimiento').fill('2023-05-01');
    // Sin teléfono en la cuenta, se pide para la cita.
    await page.getByLabel('Teléfono').fill('611 222 333');
    await page.getByRole('checkbox', { name: /acepto la política de privacidad/ }).check();
    await axeCheck(page);
    await waitForToken(page);
    await page.getByRole('button', { name: 'Confirmar cita' }).click();
    await expect(page).toHaveURL(/\/pide-cita\/confirmada\?ref=/);
    await expect(page.getByRole('status')).toContainText('Kiwi (Gato)');

    await page.goto('/mi-cuenta/mascotas');
    await expect(page.locator('ul.pets')).toContainText('Kiwi');
  });

  test('una ?mascota= ajena se ignora en silencio', async ({ page }) => {
    const c = await createCustomer();
    const other = await createCustomer();
    const foreign = await createPet(other.id, { name: 'Ajena' });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto(`/pide-cita?mascota=${foreign.id}`);
    await expect(page.getByRole('complementary', { name: 'Resumen de tu cita' })).not.toContainText('Ajena');
    await expect(page.locator('input[name="mascota"]')).toHaveCount(0);
  });
});
