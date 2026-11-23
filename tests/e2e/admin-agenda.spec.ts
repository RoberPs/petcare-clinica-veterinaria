import { createAppointmentInDb, madrid, resetAccountState, resetBookingState } from './db';
import { axeCheck, BOOKING_NOW, dismissCookies, expect, loginAsNew, test } from './fixtures';

// US2 (feature 007): agenda del día y de la semana por veterinario. Hora fija: lunes 16/11/2026 09:00.

test.describe('US2: agenda del panel', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
    await createAppointmentInDb({ staff: 'nerea-olmedo', service: 'consulta-general', startsAt: madrid('2026-11-17', '10:00'), petName: 'Lúa', contactName: 'Ana Pérez', contactEmail: 'ana@example.test', reason: 'Revisión' });
    await createAppointmentInDb({ staff: 'inigo-barral', service: 'consulta-general', startsAt: madrid('2026-11-17', '11:00'), petName: 'Bruno' });
    await createAppointmentInDb({ staff: 'inigo-barral', service: 'consulta-general', startsAt: madrid('2026-11-17', '12:00'), petName: 'Misi', status: 'cancelled' });
    await createAppointmentInDb({ staff: 'nerea-olmedo', service: 'consulta-general', startsAt: madrid('2026-11-24', '10:00'), petName: 'Toby' });
  });

  test('día y semana, navegación, filtro que se conserva y canceladas', async ({ page }) => {
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto('/admin/agenda?fecha=2026-11-17');
    await dismissCookies(page);
    await expect(page.getByText('martes, 17 de noviembre de 2026')).toBeVisible();
    const nerea = page.getByRole('region', { name: 'Dra. Nerea Olmedo' });
    const inigo = page.getByRole('region', { name: 'Dr. Íñigo Barral' });
    await expect(nerea).toContainText('Lúa (Perro) · Ana Pérez');
    await expect(inigo).toContainText('Bruno');
    await expect(inigo).not.toContainText('Misi');
    await axeCheck(page);

    // Filtro por veterinario y canceladas (formulario GET).
    await page.getByLabel('Veterinario').selectOption({ label: 'Dr. Íñigo Barral' });
    await page.getByLabel('Mostrar canceladas').check();
    await page.getByRole('button', { name: 'Ver' }).click();
    await expect(page).toHaveURL(/veterinario=inigo-barral/);
    await expect(page.getByRole('region', { name: 'Dra. Nerea Olmedo' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Dr. Íñigo Barral' })).toContainText('Misi');
    await expect(page.getByRole('region', { name: 'Dr. Íñigo Barral' })).toContainText('Cancelada');

    // Semana: el filtro se conserva; siguiente y anterior.
    await page.getByRole('navigation', { name: 'Vista de la agenda' }).getByRole('link', { name: 'Semana' }).click();
    await expect(page).toHaveURL(/vista=semana.*veterinario=inigo-barral/);
    await expect(page.getByText('Semana del 16 de noviembre de 2026 al 22 de noviembre de 2026')).toBeVisible();
    await page.getByRole('link', { name: 'Semana siguiente' }).click();
    await expect(page).toHaveURL(/fecha=2026-11-23.*veterinario=inigo-barral/);
    await page.getByRole('link', { name: 'Semana anterior' }).click();
    await page.getByRole('link', { name: 'Hoy' }).click();
    await expect(page).toHaveURL(/fecha=2026-11-16/);
    await axeCheck(page);
  });

  test('detalle con contacto e historial', async ({ page }) => {
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto('/admin/agenda?fecha=2026-11-17');
    await dismissCookies(page);
    await page.getByRole('region', { name: 'Dra. Nerea Olmedo' }).getByRole('link', { name: 'Consulta general' }).click();
    await expect(page).toHaveURL(/\/admin\/citas\/[0-9a-f-]+$/);
    const who = page.getByRole('region', { name: 'Responsable y mascota' });
    await expect(who).toContainText('Ana Pérez');
    await expect(who).toContainText('ana@example.test');
    await expect(who).toContainText('Invitado');
    await expect(page.getByRole('region', { name: 'Cita' })).toContainText('Revisión');
    await expect(page.getByRole('region', { name: 'Historial' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mover', exact: true })).toBeVisible();
    await axeCheck(page);
  });
});
