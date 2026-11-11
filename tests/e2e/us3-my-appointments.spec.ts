import { createAppointmentInDb, createCustomer, createPet, madrid, resetAccountState, resetBookingState } from './db';
import { axeCheck, BOOKING_NOW, dismissCookies, expect, loginAs, test } from './fixtures';

// US3: Mis citas (FR-021, FR-022, FR-026). Hora fija: lunes 16/11/2026 a las 09:00.

test.describe('US3: ver mis citas', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
  });

  test('próximas y anteriores con sus estados, y "Tu próxima cita" en el resumen', async ({ page }) => {
    const c = await createCustomer({ firstName: 'Lucía' });
    const pet = await createPet(c.id, { name: 'Bruno' });
    await createAppointmentInDb({ customerId: c.id, petId: pet.id, petName: 'Bruno', staff: 'nerea-olmedo', startsAt: madrid('2026-11-20', '10:00') });
    await createAppointmentInDb({ customerId: c.id, petId: pet.id, petName: 'Bruno', staff: 'inigo-barral', startsAt: madrid('2026-11-18', '12:00') });
    await createAppointmentInDb({ customerId: c.id, petId: pet.id, petName: 'Bruno', startsAt: madrid('2026-11-02', '10:00'), createdAt: madrid('2026-10-20', '10:00') });
    await createAppointmentInDb({
      customerId: c.id,
      petName: 'Bruno',
      startsAt: madrid('2026-11-09', '10:00'),
      status: 'cancelled',
      createdAt: madrid('2026-10-20', '10:00'),
    });
    await loginAs(page, c, false, new Date(BOOKING_NOW));

    await page.goto('/mi-cuenta');
    await dismissCookies(page);
    const next = page.getByRole('region', { name: 'Tu próxima cita' });
    await expect(next).toContainText('miércoles, 18 de noviembre de 2026, a las 12:00');
    await expect(next).toContainText('Consulta general para Bruno, con Dr. Íñigo Barral');
    await axeCheck(page);

    await page.getByRole('navigation', { name: 'Mi cuenta' }).getByRole('link', { name: 'Mis citas' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/citas$/);
    await expect(page.getByRole('navigation', { name: 'Mi cuenta' }).getByRole('link', { name: 'Mis citas' })).toHaveAttribute('aria-current', 'page');
    const upcoming = page.getByRole('table', { name: 'Próximas citas' }).locator('tbody tr');
    await expect(upcoming).toHaveCount(2);
    await expect(upcoming.nth(0)).toContainText('18 de noviembre');
    await expect(upcoming.nth(1)).toContainText('20 de noviembre');
    await expect(upcoming.nth(0)).toContainText('Confirmada');
    await expect(upcoming.nth(0).getByRole('link', { name: /^Cancelar/ })).toBeVisible();
    const past = page.getByRole('table', { name: 'Citas anteriores' }).locator('tbody tr');
    await expect(past).toHaveCount(2);
    await expect(past.nth(0)).toContainText('9 de noviembre');
    await expect(past.nth(0)).toContainText('Cancelada');
    await expect(past.nth(1)).toContainText('Realizada');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await axeCheck(page);
  });

  test('sin citas muestra el estado vacío con "Pide cita"', async ({ page }) => {
    const c = await createCustomer();
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/mi-cuenta/citas');
    await expect(page.getByRole('heading', { name: 'Aún no tienes citas' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Pide cita' })).toHaveAttribute('href', '/pide-cita');
    await axeCheck(page);
  });

  test('cambiar el id en la URL a una cita ajena da 404', async ({ page }) => {
    const a = await createCustomer();
    const b = await createCustomer();
    const foreign = await createAppointmentInDb({ customerId: b.id, startsAt: madrid('2026-11-20', '10:00') });
    await loginAs(page, a, false, new Date(BOOKING_NOW));
    for (const action of ['cancelar', 'cambiar']) {
      await page.goto(`/mi-cuenta/citas/${foreign.id}/${action}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos esta página');
    }
    const res = await page.request.get(`/mi-cuenta/citas/${foreign.id}/cancelar`, { maxRedirects: 0 });
    expect([303, 307, 404]).toContain(res.status());
  });
});
