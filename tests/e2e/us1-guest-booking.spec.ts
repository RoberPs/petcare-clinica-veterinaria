import type { Page } from '@playwright/test';
import { testEnv } from '../test-env';
import { createAppointmentInDb, loadPetcare, madrid, query, resetBookingState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, isNoJs, test } from './fixtures';

// US1: reserva de invitado en tres pasos (contracts/routes.md y forms.md). Hora fija: lunes
// 16/11/2026 a las 09:00 (bookingClock).

const TUESDAY = '2026-11-17';
const TUESDAY_LABEL = 'martes, 17 de noviembre de 2026';

/** El token del paso 3 exige 3 s de antigüedad (anti-robots). */
const waitForToken = (page: Page) => page.waitForTimeout(3_200);

async function fillGuestDetails(page: Page, email: string, overrides: Partial<Record<string, string>> = {}) {
  await page.getByLabel('Nombre de la mascota').fill(overrides.pet ?? 'Lúa');
  await page.getByLabel('Especie').selectOption({ label: 'Perro' });
  await page.getByLabel('Nombre y apellidos').fill(overrides.name ?? 'Persona de Prueba');
  await page.getByLabel('Teléfono').fill(overrides.phone ?? '600 123 456');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Motivo de la consulta (opcional)').fill('Revisión anual');
  await page.getByRole('checkbox', { name: /acepto la política de privacidad/ }).check();
}

const summary = (page: Page) => page.getByRole('complementary', { name: 'Resumen de tu cita' });

test.describe('US1: reservar como invitado', () => {
  test.beforeEach(async ({ page, bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetBookingState();
    await fakeEmails.clear();
    await page.goto('/pide-cita');
    await dismissCookies(page);
  });

  test('reserva completa: resumen en cada paso, confirmación, correos y hora ocupada', async ({ page }, info) => {
    const email = `invitado-${info.project.name}@example.test`;

    // Paso 1.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pide cita online');
    await expect(page.locator('[aria-current="step"]')).toHaveText('1 Servicio');
    await expect(summary(page)).toContainText('Servicio—');
    await axeCheck(page);
    await page.getByLabel('Tipo de servicio').selectOption('consulta-general');
    await expect(page.getByLabel('Veterinario/a')).toHaveValue('sin-preferencia');
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Paso 2.
    await expect(page.locator('[aria-current="step"]')).toHaveText('2 Fecha y hora');
    await expect(summary(page)).toContainText('Consulta general (30 min)');
    await expect(summary(page)).toContainText('Sin preferencia');
    await axeCheck(page);
    await page.getByLabel('Fecha', { exact: true }).fill(TUESDAY);
    await page.getByRole('button', { name: 'Ver horas' }).click();
    const group = page.getByRole('group', { name: 'Horas disponibles' });
    await expect(group).toContainText(`El ${TUESDAY_LABEL}`);
    await group.getByRole('radio', { name: '10:00' }).check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Paso 3.
    await expect(page.locator('[aria-current="step"]')).toHaveText('3 Tus datos');
    await expect(summary(page)).toContainText(TUESDAY_LABEL);
    await expect(summary(page)).toContainText('10:00');
    await expect(page.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', /^\/iniciar-sesion\?return_to=%2Fpide-cita%3F/);
    await expect(page.getByRole('checkbox', { name: /acepto la política de privacidad/ })).not.toBeChecked();
    await axeCheck(page);
    await fillGuestDetails(page, email);
    await waitForToken(page);
    await page.getByRole('button', { name: 'Confirmar cita' }).click();

    // Confirmación con el profesional asignado (B4: todos sin citas → el primero del equipo).
    await expect(page).toHaveURL(/\/pide-cita\/confirmada\?ref=/);
    const ok = page.getByRole('status');
    await expect(ok).toContainText(`Te esperamos el ${TUESDAY_LABEL}`);
    await expect(ok).toContainText('Consulta general');
    await expect(ok).toContainText('Dra. Nerea Olmedo');
    await expect(ok).toContainText('Lúa (Perro)');
    await expect(ok).toContainText('10:00');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await axeCheck(page);

    // Los dos correos llegan al buzón falso.
    await expect.poll(async () => (await fakeEmails.to(email)).map((e) => e.body.subject)).toContain('Tu cita en PetCare está confirmada');
    await expect
      .poll(async () => (await fakeEmails.to(testEnv.CLINIC_INBOX_EMAIL)).map((e) => e.body.subject))
      .toContain('Cita nueva: 17/11/2026 10:00, Consulta general');
    const [guestMail] = await fakeEmails.to(email);
    expect(guestMail!.body.textContent).toContain(`llámanos al ${testEnv.CLINIC_PHONE_DISPLAY}`);
    expect(guestMail!.body.textContent).not.toContain('Revisión anual');

    // Otra pestaña ya no ve esa hora con la misma profesional.
    const other = await page.context().newPage();
    await other.goto(`/pide-cita?servicio=consulta-general&profesional=nerea-olmedo&fecha=${TUESDAY}`);
    const otherGroup = other.getByRole('group', { name: 'Horas disponibles' });
    await expect(otherGroup.getByRole('radio', { name: '09:30' })).toBeVisible();
    await expect(otherGroup.getByRole('radio', { name: '10:00' })).toHaveCount(0);
  });

  test('un día sin horas ofrece el siguiente con huecos', async ({ page }) => {
    await page.goto('/pide-cita?servicio=consulta-general&profesional=sin-preferencia&fecha=2026-11-22');
    await expect(page.getByText('No quedan horas libres el domingo, 22 de noviembre de 2026.')).toBeVisible();
    await page.getByRole('link', { name: 'Ver horas del lunes, 23 de noviembre de 2026' }).click();
    await expect(page.getByRole('group', { name: 'Horas disponibles' }).getByRole('radio', { name: '09:30' })).toBeVisible();
    await axeCheck(page);
  });

  test('una Cirugía de 60 min no se ofrece a las 13:30 si se cierra a las 14:00', async ({ page }) => {
    await page.goto(`/pide-cita?servicio=cirugia&profesional=sin-preferencia&fecha=${TUESDAY}`);
    const group = page.getByRole('group', { name: 'Horas disponibles' });
    await expect(group.getByRole('radio', { name: '13:00' })).toBeVisible();
    await expect(group.getByRole('radio', { name: '13:30' })).toHaveCount(0);
  });

  test('los errores aparecen junto al campo y se conservan los datos', async ({ page }, info) => {
    await page.goto(`/pide-cita?servicio=consulta-general&profesional=sin-preferencia&fecha=${TUESDAY}&hora=11:00`);
    // Valores que el navegador admite pero el servidor no (también sin JavaScript).
    await fillGuestDetails(page, 'a@b', { phone: '123' });
    await waitForToken(page);
    await page.getByRole('button', { name: 'Confirmar cita' }).click();
    const alert = page.locator('.form-summary');
    await expect(alert).toContainText('Revisa estos 2 campos');
    await expect(page.getByLabel('Teléfono')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#telefono-error')).toHaveText('Escribe un teléfono de contacto válido.');
    await expect(page.locator('#correo-error')).toHaveText('Escribe un correo válido.');
    await expect(page.getByLabel('Nombre y apellidos')).toHaveValue('Persona de Prueba');
    await expect(page.getByLabel('Nombre de la mascota')).toHaveValue('Lúa');
    if (!isNoJs(info.project.name)) await expect(alert).toBeFocused();
    await axeCheck(page);
  });

  test('confirmar una hora que se ha ocupado vuelve al paso 3 con los datos y otras horas', async ({ page }, info) => {
    const email = `ocupada-${info.project.name}@example.test`;
    await page.goto(`/pide-cita?servicio=consulta-general&profesional=inigo-barral&fecha=${TUESDAY}&hora=11:00`);
    await fillGuestDetails(page, email);
    // Mientras tanto, otra persona reserva esa misma hora.
    await createAppointmentInDb({ service: 'consulta-general', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '11:00') });
    await waitForToken(page);
    await page.getByRole('button', { name: 'Confirmar cita' }).click();

    await expect(page.locator('.form-summary')).toContainText('Esa hora se acaba de ocupar');
    await expect(page).not.toHaveURL(/confirmada/);
    const group = page.getByRole('group', { name: 'Horas disponibles' });
    await expect(group.getByRole('radio', { name: '11:00' })).toHaveCount(0);
    await expect(page.getByLabel('Nombre y apellidos')).toHaveValue('Persona de Prueba');
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(email);
    await axeCheck(page);

    // Elige otra hora y confirma sin volver a escribir nada (salvo la casilla, que nunca se premarca).
    await group.getByRole('radio', { name: '11:30' }).check();
    const privacy = page.getByRole('checkbox', { name: /acepto la política de privacidad/ });
    if (!(await privacy.isChecked())) await privacy.check();
    await page.getByRole('button', { name: 'Confirmar cita' }).click();
    await expect(page).toHaveURL(/\/pide-cita\/confirmada\?ref=/);
    await expect(page.getByRole('status')).toContainText('11:30');
    await expect(page.getByRole('status')).toContainText('Dr. Íñigo Barral');
  });

  test('una referencia de confirmación manipulada no muestra datos', async ({ page }) => {
    await page.goto('/pide-cita/confirmada?ref=abc.def');
    await expect(page.getByRole('status')).toContainText('Tu cita está confirmada');
    await expect(page.getByRole('status')).not.toContainText('Te esperamos');
  });
});

test.describe('US1: sin veterinarios con horario (feature 007, FR-017)', () => {
  test.afterEach(async () => {
    await loadPetcare();
  });

  test('sin ningún servicio activo con veterinario y horario: aviso con enlace a contacto', async ({ page }) => {
    await query('DELETE FROM staff_hours');
    await page.goto('/pide-cita');
    await dismissCookies(page);
    await expect(page.getByText('Ahora no hay citas online disponibles')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contacta con la clínica' })).toHaveAttribute('href', '/contacto');
    await axeCheck(page);
  });
});