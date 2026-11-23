import { testEnv } from '../test-env';
import { createAppointmentInDb, createCustomer, createPet, madrid, resetAccountState, resetBookingState } from './db';
import { axeCheck, BOOKING_NOW, dismissCookies, expect, loginAs, test } from './fixtures';

// US4: cancelar o cambiar desde la cuenta (FR-023 a FR-025, B12). Hora fija: lunes 16/11/2026 09:00.

test.describe('US4: cancelar o cambiar desde la cuenta', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
  });

  test('cancelar con la página de confirmación', async ({ page }) => {
    const c = await createCustomer();
    await createAppointmentInDb({ customerId: c.id, staff: 'nerea-olmedo', startsAt: madrid('2026-11-20', '10:00') });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/mi-cuenta/citas');
    await dismissCookies(page);
    await page.getByRole('link', { name: /^Cancelar la cita de Consulta general/ }).click();
    await expect(page.getByRole('heading', { name: '¿Cancelar esta cita?' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('viernes, 20 de noviembre de 2026');
    await axeCheck(page);
    await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/citas\?aviso=cita-cancelada$/);
    await expect(page.getByRole('status')).toContainText('Hemos cancelado la cita');
    await expect(page.getByRole('table', { name: 'Próximas citas' })).toContainText('Cancelada');
    await axeCheck(page);
  });

  test('cambiar con el paso de fecha y hora y el servicio fijo', async ({ page }) => {
    const c = await createCustomer();
    await createAppointmentInDb({ customerId: c.id, staff: 'nerea-olmedo', startsAt: madrid('2026-11-20', '10:00') });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/mi-cuenta/citas');
    await dismissCookies(page);
    await page.getByRole('link', { name: /^Cambiar la cita de Consulta general/ }).click();
    await expect(page.getByText('Consulta general (30 min). Ahora: viernes, 20 de noviembre de 2026 a las 10:00.')).toBeVisible();
    await expect(page.getByLabel('Veterinario/a')).toHaveValue('nerea-olmedo');
    await axeCheck(page);
    await page.getByLabel('Fecha', { exact: true }).fill('2026-11-19');
    await page.getByRole('button', { name: 'Ver horas' }).click();
    await page.getByRole('group', { name: 'Horas disponibles' }).getByRole('radio', { name: '17:00' }).check();
    await page.getByRole('button', { name: 'Cambiar la cita' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/citas\?aviso=cita-cambiada$/);
    await expect(page.getByRole('status')).toContainText('Hemos cambiado la cita');
    const row = page.getByRole('table', { name: 'Próximas citas' }).locator('tbody tr').first();
    await expect(row).toContainText('jueves, 19 de noviembre de 2026');
    await expect(row).toContainText('17:00');
  });

  test('una cita a menos de 24 h muestra el teléfono y no tiene acciones', async ({ page }) => {
    const c = await createCustomer();
    await createAppointmentInDb({ customerId: c.id, startsAt: madrid('2026-11-16', '16:30') });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/mi-cuenta/citas');
    const row = page.getByRole('table', { name: 'Próximas citas' }).locator('tbody tr').first();
    await expect(row).toContainText(`Para cambiarla, llama al ${testEnv.CLINIC_PHONE_DISPLAY}`);
    await expect(row.getByRole('link', { name: /^Cancelar/ })).toHaveCount(0);
    await expect(row.getByRole('link', { name: /^Cambiar/ })).toHaveCount(0);
  });

  test('avisos de las citas que se cancelarán al eliminar una mascota y la cuenta', async ({ page }) => {
    const c = await createCustomer();
    const pet = await createPet(c.id, { name: 'Bruno' });
    await createAppointmentInDb({ customerId: c.id, petId: pet.id, petName: 'Bruno', startsAt: madrid('2026-11-20', '10:00') });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto(`/mi-cuenta/mascotas/${pet.id}/eliminar`);
    await expect(page.getByText('Tiene 1 cita próxima que se cancelará')).toBeVisible();
    await axeCheck(page);
    await page.goto('/mi-cuenta/eliminar-cuenta');
    await expect(page.getByText('Tienes 1 cita próxima que se cancelará')).toBeVisible();
  });
});
