import type { Page } from '@playwright/test';
import { createAppointmentInDb, createCustomer, madrid, query, resetAccountState, resetBookingState } from './db';
import { BOOKING_NOW, dismissCookies, expect, fakeEmails, loginAs, setTestNow, test } from './fixtures';

// Escenarios de quickstart.md que no cubrían del todo los e2e de cada historia: 2 (recargar y Atrás),
// 4 (sábado por la tarde y cierre), 8 (envío forzado fuera de plazo) y 10 (invitado con el correo
// de una cuenta). Hora fija: lunes 16/11/2026 a las 09:00.

const TUESDAY = '2026-11-17';

async function bookAsGuest(page: Page, email: string, time: string): Promise<void> {
  await page.goto('/pide-cita');
  await dismissCookies(page);
  await page.goto(`/pide-cita?servicio=consulta-general&profesional=nerea-olmedo&fecha=${TUESDAY}&hora=${time}`);
  await page.getByLabel('Nombre de la mascota').fill('Lúa');
  await page.getByLabel('Especie').selectOption({ label: 'Perro' });
  await page.getByLabel('Nombre y apellidos').fill('Persona de Prueba');
  await page.getByLabel('Teléfono').fill('600 123 456');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('checkbox', { name: /acepto la política de privacidad/ }).check();
  await page.waitForTimeout(3_200);
  await page.getByRole('button', { name: 'Confirmar cita' }).click();
  await expect(page).toHaveURL(/\/pide-cita\/confirmada\?ref=/);
}

test.describe('quickstart: escenarios restantes', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
    await fakeEmails.clear();
  });

  test('2: recargar la confirmación y volver atrás no crea otra cita', async ({ page }, info) => {
    await bookAsGuest(page, `atras-${info.project.name}@example.test`, '10:00');
    await page.reload();
    await expect(page.getByRole('status')).toContainText('Te esperamos el martes, 17 de noviembre de 2026');
    await page.goBack();
    // El paso 3 se vuelve a pedir al servidor (no-store): la hora ya es suya, así que no se ofrece.
    await expect(page.locator('.form-summary')).toContainText('Esa hora se acaba de ocupar');
    await expect(page.getByRole('group', { name: 'Horas disponibles' }).getByRole('radio', { name: '10:00' })).toHaveCount(0);
    expect(await query('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 1 }]);
  });

  test('4: el sábado no hay horas de tarde y el día de cierre ofrece el siguiente', async ({ page }) => {
    await page.goto('/pide-cita?servicio=consulta-general&profesional=sin-preferencia&fecha=2026-11-21');
    const saturday = page.getByRole('group', { name: 'Horas disponibles' });
    await expect(saturday.getByRole('radio', { name: '13:30' })).toBeVisible();
    await expect(saturday.getByRole('radio', { name: '16:30' })).toHaveCount(0);

    await page.goto('/pide-cita?servicio=consulta-general&profesional=sin-preferencia&fecha=2026-12-08');
    await expect(page.getByText('No quedan horas libres el martes, 8 de diciembre de 2026.')).toBeVisible();
    await page.getByRole('link', { name: 'Ver horas del miércoles, 9 de diciembre de 2026' }).click();
    await expect(page.getByRole('group', { name: 'Horas disponibles' }).getByRole('radio', { name: '09:30' })).toBeVisible();
  });

  test('8: un envío hecho ya fuera de plazo se rechaza en el servidor', async ({ page }) => {
    const c = await createCustomer();
    // Martes 09:30: a las 09:00 del lunes faltan 24,5 h (dentro de plazo).
    await createAppointmentInDb({ customerId: c.id, startsAt: madrid(TUESDAY, '09:30') });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/mi-cuenta/citas');
    await dismissCookies(page);
    await page.getByRole('link', { name: /^Cancelar la cita de/ }).click();
    const button = page.getByRole('button', { name: 'Sí, cancelar la cita' });
    await expect(button).toBeVisible();
    // Con la página abierta pasa una hora (la sesión sigue viva): ya faltan 23,5 h.
    await setTestNow(page, madrid('2026-11-16', '10:00').toISOString());
    await button.click();
    await expect(page).toHaveURL(/\/mi-cuenta\/citas\?aviso=fuera-de-plazo$/);
    await expect(page.getByRole('status')).toContainText('Ya no se puede cancelar ni cambiar esta cita desde la web');
    expect(await query('SELECT status FROM appointments')).toEqual([{ status: 'confirmed' }]);
  });

  test('10: un invitado con el correo de una cuenta ve lo mismo y la cita no va a la cuenta', async ({ page }, info) => {
    const email = `con-cuenta-${info.project.name}@example.test`;
    const c = await createCustomer({ email });
    await bookAsGuest(page, email, '11:00');
    await expect(page.getByRole('status')).toContainText('Te esperamos el martes, 17 de noviembre de 2026');
    await expect(page.getByRole('link', { name: 'Ver mis citas' })).toHaveCount(0);

    await expect.poll(async () => (await fakeEmails.to(email)).length).toBeGreaterThan(0);
    const [mail] = await fakeEmails.to(email);
    expect(mail!.body.textContent).toContain('La próxima vez, inicia sesión para ver tus citas en tu cuenta.');

    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/mi-cuenta/citas');
    await expect(page.getByRole('heading', { name: 'Aún no tienes citas' })).toBeVisible();
  });
});
