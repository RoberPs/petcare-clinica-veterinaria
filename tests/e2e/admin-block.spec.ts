import type { Page } from '@playwright/test';
import { createAppointmentInDb, loadPetcare, madrid, query, resetAccountState, resetBookingState } from './db';
import { axeCheck, BOOKING_NOW, dismissCookies, expect, fakeEmails, isNoJs, loginAsNew, test } from './fixtures';

// US5 (feature 007): bloqueos puntuales y semanales, con la revisión de las citas afectadas.
// Hora fija: lunes 16/11/2026 a las 09:00. Revisar es un GET y confirmar un POST (sin JavaScript).

async function freeTimes(page: Page, date: string, staff = 'nerea-olmedo'): Promise<string[]> {
  await page.goto(`/pide-cita?servicio=consulta-general&profesional=${staff}&fecha=${date}`);
  const group = page.getByRole('group', { name: 'Horas disponibles' });
  if ((await group.count()) === 0) return [];
  return group.getByRole('radio').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

async function fillOnce(page: Page, o: { staff?: string; start: [string, string]; end: [string, string]; reason: string }) {
  if (o.staff) {
    await page.getByRole('radio', { name: 'Un veterinario' }).check();
    await page.getByLabel('Veterinario (si bloqueas a uno)').selectOption({ label: o.staff });
  } else {
    await page.getByRole('radio', { name: 'Toda la clínica' }).check();
  }
  await page.getByRole('radio', { name: /^Puntual/ }).check();
  const once = page.getByRole('group', { name: 'Si es puntual' });
  await once.getByLabel('Fecha de inicio').fill(o.start[0]);
  await once.getByLabel('Hora de inicio').fill(o.start[1]);
  await once.getByLabel('Fecha de fin').fill(o.end[0]);
  await once.getByLabel('Hora de fin').fill(o.end[1]);
  await page.getByLabel('Motivo interno (no lo ven los clientes)').fill(o.reason);
}

test.describe('US5: bloqueos desde el panel', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
    await query('DELETE FROM schedule_blocks');
  });
  test.afterAll(async () => {
    await loadPetcare();
  });

  test('bloquear de lunes a viernes a un veterinario: sin franjas; borrar el bloqueo las devuelve', async ({ page }) => {
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    expect(await freeTimes(page, '2026-11-24')).toContain('10:00');
    await page.goto('/admin/bloqueos/nuevo');
    await dismissCookies(page);
    await axeCheck(page);
    await fillOnce(page, { staff: 'Dra. Nerea Olmedo', start: ['2026-11-23', '00:00'], end: ['2026-11-28', '00:00'], reason: 'Vacaciones' });
    await page.getByRole('button', { name: 'Revisar' }).click();
    await expect(page).toHaveURL(/revisar=1/);
    await expect(page.getByText('No hay citas confirmadas en ese periodo.')).toBeVisible();
    await axeCheck(page);
    await page.getByRole('button', { name: 'Guardar bloqueo' }).click();
    await expect(page).toHaveURL(/\/admin\/agenda\?fecha=2026-11-23&aviso=bloqueo-guardado/);
    await expect(page.getByRole('status')).toContainText('Bloqueo guardado');
    await expect(page.getByRole('region', { name: 'Dra. Nerea Olmedo' })).toContainText('Vacaciones');

    for (const d of ['2026-11-23', '2026-11-25', '2026-11-27']) expect(await freeTimes(page, d), d).toEqual([]);
    expect(await freeTimes(page, '2026-11-24', 'inigo-barral')).toContain('10:00');

    await page.goto('/admin/bloqueos');
    await axeCheck(page);
    await page.getByRole('link', { name: 'Editar o borrar' }).click();
    await page.getByRole('button', { name: 'Borrar el bloqueo' }).click();
    await expect(page.getByRole('status')).toContainText('Bloqueo borrado');
    expect(await freeTimes(page, '2026-11-24')).toContain('10:00');
  });

  test('un día con una cita: "Mantener" la deja fuera de horario; "Cancelarlas todas" la cancela con correo', async ({ page }) => {
    const email = `bloqueo-${Date.now()}@example.test`;
    await createAppointmentInDb({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid('2026-11-18', '10:00'), contactEmail: email, petName: 'Lúa' });
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });

    // Mantener.
    await page.goto('/admin/bloqueos/nuevo');
    await dismissCookies(page);
    await fillOnce(page, { staff: 'Dra. Nerea Olmedo', start: ['2026-11-18', '09:30'], end: ['2026-11-18', '14:00'], reason: 'Formación' });
    await page.getByRole('button', { name: 'Revisar' }).click();
    await expect(page.getByText('Hay 1 cita confirmada')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Mantenerlas (quedan fuera de horario)' })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Cancelarlas todas y avisar a los clientes' })).not.toBeChecked();
    await axeCheck(page);
    await page.getByRole('radio', { name: 'Mantenerlas (quedan fuera de horario)' }).check();
    await page.getByRole('button', { name: 'Guardar bloqueo' }).click();
    await expect(page.getByRole('status')).toContainText('Bloqueo guardado');
    await expect(page.getByRole('region', { name: 'Dra. Nerea Olmedo' })).toContainText('Fuera de horario');

    // Editar el mismo bloqueo y cancelar la cita.
    await page.getByRole('link', { name: 'Editar bloqueo' }).first().click();
    await page.getByLabel('Motivo interno (no lo ven los clientes)').fill('Formación externa');
    await page.getByRole('button', { name: 'Revisar' }).click();
    // Ya está fuera de horario por este mismo bloqueo: no vuelve a contar como afectada.
    await expect(page.getByText('No hay citas confirmadas en ese periodo.')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar bloqueo' }).click();
    await expect(page.getByRole('status')).toContainText('Bloqueo guardado');

    // Un bloqueo nuevo de toda la clínica ese día con cancel_all.
    await query('DELETE FROM schedule_blocks');
    await page.goto('/admin/bloqueos/nuevo');
    await fillOnce(page, { start: ['2026-11-18', '09:30'], end: ['2026-11-18', '11:00'], reason: 'Corte de luz' });
    await page.getByRole('button', { name: 'Revisar' }).click();
    await page.getByRole('radio', { name: 'Cancelarlas todas y avisar a los clientes' }).check();
    await page.getByRole('button', { name: 'Guardar bloqueo' }).click();
    await expect(page.getByRole('status')).toContainText('Se ha cancelado 1 cita');
    const deadline = Date.now() + 10_000;
    while (!(await fakeEmails.to(email)).some((e) => /se ha cancelado$/.test(e.body.subject ?? '')) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    expect((await fakeEmails.to(email)).some((e) => /se ha cancelado$/.test(e.body.subject ?? ''))).toBe(true);
  });

  test('descanso semanal de 11:00 a 11:30 de lunes a viernes', async ({ page }) => {
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto('/admin/bloqueos/nuevo');
    await dismissCookies(page);
    await page.getByRole('radio', { name: 'Toda la clínica' }).check();
    await page.getByRole('radio', { name: /^Se repite cada semana/ }).check();
    const weekly = page.getByRole('group', { name: 'Si se repite cada semana' });
    await weekly.getByLabel('Desde').fill('2026-11-16');
    await weekly.getByLabel('Hasta').fill('2027-02-16');
    await weekly.getByLabel('Hora de inicio').fill('11:00');
    await weekly.getByLabel('Hora de fin').fill('11:30');
    for (const d of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']) await weekly.getByLabel(d).check();
    await page.getByLabel('Motivo interno (no lo ven los clientes)').fill('Descanso');
    await page.getByRole('button', { name: 'Revisar' }).click();
    await page.getByRole('button', { name: 'Guardar bloqueo' }).click();
    await expect(page.getByRole('status')).toContainText('Bloqueo guardado');
    const t = await freeTimes(page, '2026-11-19');
    expect(t).toContain('10:30');
    expect(t).not.toContain('11:00');
    expect(t).toContain('11:30');
  });

  test('errores junto al campo: fin anterior al inicio', async ({ page }) => {
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto('/admin/bloqueos/nuevo');
    await dismissCookies(page);
    await fillOnce(page, { start: ['2026-11-18', '12:00'], end: ['2026-11-18', '11:00'], reason: 'X' });
    await page.getByRole('button', { name: 'Revisar' }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText('El fin tiene que ser posterior al inicio');
    await expect(page.getByRole('group', { name: 'Si es puntual' }).getByLabel('Hora de fin')).toHaveAttribute('aria-invalid', 'true');
    await axeCheck(page);
  });

  test('teclado: revisar con Enter', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name) || info.project.name === 'mobile-360', 'teclado en escritorio');
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto('/admin/bloqueos/nuevo');
    await dismissCookies(page);
    await fillOnce(page, { start: ['2026-11-30', '10:00'], end: ['2026-11-30', '11:00'], reason: 'Reunión' });
    await page.getByLabel('Motivo interno (no lo ven los clientes)').press('Enter');
    await expect(page).toHaveURL(/revisar=1/);
    await expect(page.getByRole('button', { name: 'Guardar bloqueo' })).toBeVisible();
  });
});
