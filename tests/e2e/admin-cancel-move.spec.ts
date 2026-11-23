import { createAppointmentInDb, madrid, resetAccountState, resetBookingState } from './db';
import { axeCheck, BOOKING_NOW, dismissCookies, expect, fakeEmails, isNoJs, loginAsNew, test } from './fixtures';

// US4 (feature 007): cancelar y mover una cita desde el panel, con correo al responsable.
// Hora fija: lunes 16/11/2026 a las 09:00.

const TUESDAY = '2026-11-17';

async function emailWithSubject(address: string, subject: RegExp, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await fakeEmails.to(address)).filter((e) => subject.test(e.body.subject ?? ''));
    if (found.length > 0) return found[found.length - 1]!;
    if (Date.now() > deadline) throw new Error(`No ha llegado ningún correo ${subject} a ${address}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function freeTimes(page: import('@playwright/test').Page): Promise<string[]> {
  await page.goto(`/pide-cita?servicio=consulta-general&profesional=nerea-olmedo&fecha=${TUESDAY}`);
  const group = page.getByRole('group', { name: 'Horas disponibles' });
  return group.getByRole('radio').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

test.describe('US4: cancelar y mover desde el panel', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
  });

  test('cancelar con nota: la franja queda libre y llega el correo con el mensaje de la clínica', async ({ page }) => {
    const email = `cancelar-${Date.now()}@example.test`;
    const a = await createAppointmentInDb({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00'), contactEmail: email });
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    expect(await freeTimes(page)).not.toContain('10:00');

    await page.goto(`/admin/citas/${a.id}`);
    await dismissCookies(page);
    await page.getByRole('link', { name: 'Cancelar la cita' }).click();
    await axeCheck(page);
    await page.getByLabel('Mensaje para el cliente (opcional)').fill('Lo sentimos, la doctora no puede atenderte ese día.');
    await page.getByRole('button', { name: 'Cancelar la cita' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/citas/${a.id}\\?aviso=cancelada$`));
    await expect(page.getByRole('status')).toContainText('Cita cancelada');
    await expect(page.getByRole('region', { name: 'Historial' })).toContainText('Cancelada por la clínica, desde el panel');
    await expect(page.getByRole('link', { name: 'Mover', exact: true })).toHaveCount(0);

    const mail = await emailWithSubject(email, /se ha cancelado$/);
    expect(mail.body.textContent).toContain('Mensaje de la clínica');
    expect(mail.body.textContent).toContain('la doctora no puede atenderte');
    expect(await freeTimes(page)).toContain('10:00');
  });

  test('mover: la franja antigua queda libre, la nueva ocupada y llega el correo con las dos horas', async ({ page }) => {
    const email = `mover-${Date.now()}@example.test`;
    const a = await createAppointmentInDb({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00'), contactEmail: email });
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto(`/admin/citas/${a.id}`);
    await dismissCookies(page);
    await page.getByRole('link', { name: 'Mover', exact: true }).click();
    await axeCheck(page);
    await page.getByRole('radio', { name: '12:00' }).check();
    await page.getByRole('button', { name: 'Mover la cita' }).click();
    await expect(page).toHaveURL(new RegExp(`\\?aviso=movida$`));
    await expect(page.getByRole('status')).toContainText('Cita movida');
    await expect(page.getByRole('region', { name: 'Historial' })).toContainText('Movida por la clínica, desde el panel');

    const mail = await emailWithSubject(email, /ha cambiado$/);
    expect(mail.body.textContent).toContain('10:00');
    expect(mail.body.textContent).toContain('12:00');
    const times = await freeTimes(page);
    expect(times).toContain('10:00');
    expect(times).not.toContain('12:00');
  });

  test('franja ocupada al confirmar: vuelve con la fecha y el veterinario elegidos', async ({ page }) => {
    const a = await createAppointmentInDb({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00') });
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto(`/admin/citas/${a.id}/mover?fecha=${TUESDAY}`);
    await dismissCookies(page);
    await page.getByRole('radio', { name: '12:30' }).check();
    // Otra persona ocupa esa franja antes de confirmar.
    await createAppointmentInDb({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '12:30') });
    await page.getByRole('button', { name: 'Mover la cita' }).click();
    await expect(page).toHaveURL(new RegExp(`/mover\\?fecha=${TUESDAY}&veterinario=[0-9a-f-]+&aviso=franja-ocupada$`));
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText('Esa franja ya no está libre');
    await expect(page.getByLabel('Fecha', { exact: true })).toHaveValue(TUESDAY);
    await expect(page.getByRole('radio', { name: '12:30' })).toHaveCount(0);
  });

  test('teclado: cancelar con el teclado', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name) || info.project.name === 'mobile-360', 'teclado en escritorio');
    const a = await createAppointmentInDb({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '11:00') });
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto(`/admin/citas/${a.id}/cancelar`);
    await dismissCookies(page);
    await page.getByLabel('Mensaje para el cliente (opcional)').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancelar la cita' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Cita cancelada');
  });
});
