import type { Page } from '@playwright/test';
import { testEnv } from '../test-env';
import { query, resetBookingState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, test } from './fixtures';

// US5: la clínica gestiona una cita con el enlace firmado de su correo (FR-027, B7).

const TUESDAY = '2026-11-17';

/** Reserva como invitado por la interfaz y devuelve la ruta del enlace de gestión del correo a la clínica. */
async function bookAsGuest(page: Page, email: string, time: string): Promise<string> {
  await page.goto('/pide-cita');
  await dismissCookies(page);
  await page.goto(`/pide-cita?servicio=consulta-general&profesional=sin-preferencia&fecha=${TUESDAY}&hora=${time}`);
  await page.getByLabel('Nombre de la mascota').fill('Lúa');
  await page.getByLabel('Especie').selectOption({ label: 'Perro' });
  await page.getByLabel('Nombre y apellidos').fill('Persona Invitada');
  await page.getByLabel('Teléfono').fill('600 123 456');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('checkbox', { name: /acepto la política de privacidad/ }).check();
  await page.waitForTimeout(3_200);
  await page.getByRole('button', { name: 'Confirmar cita' }).click();
  await expect(page).toHaveURL(/\/pide-cita\/confirmada/);
  return manageLinkFor(time);
}

async function manageLinkFor(time: string): Promise<string> {
  let link = '';
  await expect
    .poll(async () => {
      const mails = (await fakeEmails.to(testEnv.CLINIC_INBOX_EMAIL)).filter((m) => (m.body.subject ?? '').includes(`17/11/2026 ${time}`));
      const text = mails.at(-1)?.body.textContent ?? '';
      link = text.match(/https?:\/\/[^/\s]+(\/gestion-cita\/[A-Za-z0-9_.-]+)/)?.[1] ?? '';
      return link;
    })
    .not.toBe('');
  return link;
}

test.describe('US5: gestión de la clínica con el enlace del correo', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetBookingState();
    await fakeEmails.clear();
  });

  test('abrir no cancela; cancelar libera la hora y el enlace deja de valer', async ({ page }, info) => {
    const email = `gestion-${info.project.name}@example.test`;
    const link = await bookAsGuest(page, email, '10:00');

    // El correo del invitado le dice que llame a la clínica (FR-019) y no lleva el enlace.
    const [guestMail] = await fakeEmails.to(email);
    expect(guestMail!.body.textContent).toContain(`llámanos al ${testEnv.CLINIC_PHONE_DISPLAY}`);
    expect(guestMail!.body.textContent).not.toContain('gestion-cita');

    const res = await page.goto(link);
    // same-origin: el token nunca sale del sitio como Referer (no-referrer rompe los POST sin JavaScript).
    expect(res!.headers()['referrer-policy']).toBe('same-origin');
    expect(res!.headers()['cache-control']).toContain('no-store');
    expect(res!.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.getByRole('heading', { name: 'Cita de Persona Invitada' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('martes, 17 de noviembre de 2026');
    await expect(page.getByRole('main')).toContainText('600 123 456');
    await axeCheck(page);
    // Abrir la página no ha cambiado nada.
    expect(await query("SELECT status FROM appointments")).toEqual([{ status: 'confirmed' }]);

    await page.getByRole('button', { name: 'Cancelar cita' }).click();
    await expect(page.getByRole('status')).toContainText('Hemos cancelado la cita');
    await expect(page.getByRole('heading', { name: 'Este enlace ya no es válido' })).toBeVisible();
    expect(await query('SELECT status, cancelled_by FROM appointments')).toEqual([{ status: 'cancelled', cancelled_by: 'clinic' }]);
    await expect.poll(async () => (await fakeEmails.to(email)).map((m) => m.body.subject)).toContain('Tu cita en PetCare se ha cancelado');

    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Este enlace ya no es válido' })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText('Persona Invitada');
    await axeCheck(page);
  });

  test('cambiar la fecha u hora lleva al enlace nuevo y el antiguo deja de valer', async ({ page }, info) => {
    const link = await bookAsGuest(page, `cambio-${info.project.name}@example.test`, '11:00');
    await page.goto(link);
    await page.getByRole('link', { name: 'Cambiar fecha u hora' }).click();
    await expect(page.getByRole('heading', { name: 'Cita actual' })).toBeVisible();
    await page.getByLabel('Fecha', { exact: true }).fill('2026-11-18');
    await page.getByRole('button', { name: 'Ver horas' }).click();
    await page.getByRole('group', { name: 'Horas disponibles' }).getByRole('radio', { name: '12:30' }).check();
    await axeCheck(page);
    await page.getByRole('button', { name: 'Cambiar la cita' }).click();

    await expect(page.getByRole('status')).toContainText('Hemos cambiado la cita');
    await expect(page.getByRole('main')).toContainText('miércoles, 18 de noviembre de 2026');
    expect(new URL(page.url()).pathname).not.toBe(link);
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Este enlace ya no es válido' })).toBeVisible();
  });

  test('un enlace manipulado no muestra datos', async ({ page }) => {
    await page.goto('/gestion-cita/abc.def');
    await expect(page.getByRole('heading', { name: 'Este enlace ya no es válido' })).toBeVisible();
  });
});
