import type { Page } from '@playwright/test';
import { loadPetcare, query, resetAccountState, resetBookingState } from './db';
import { axeCheck, BOOKING_NOW, dismissCookies, expect, loginAsNew, test } from './fixtures';

// US3 (feature 007): servicios, veterinarios y horarios desde el panel, con efecto inmediato en la
// reserva pública. Hora fija: lunes 16/11/2026 a las 09:00.

const TUESDAY = '2026-11-17';

async function freeTimes(page: Page, service: string, staff: string): Promise<string[]> {
  await page.goto(`/pide-cita?servicio=${service}&profesional=${staff}&fecha=${TUESDAY}`);
  const group = page.getByRole('group', { name: 'Horas disponibles' });
  if ((await group.count()) === 0) return [];
  return (await group.getByRole('radio').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).sort();
}

test.describe('US3: servicios y horarios desde el panel', () => {
  test.beforeEach(async ({ bookingClock }) => {
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
  });
  // Lo creado desde el panel no está en el YAML: --force-booking no lo borra (FK restrict).
  const cleanPanelData = async () => {
    await query("DELETE FROM booking_services WHERE slug LIKE 'ecografia%'");
    await query("DELETE FROM team_members WHERE slug LIKE 'dra-carla-ruiz%'");
  };
  test.beforeEach(cleanPanelData);
  test.afterEach(async () => {
    await cleanPanelData();
    await loadPetcare();
  });

  test('servicio de 45 min con un veterinario de martes 10:00–13:00: solo esas franjas; desactivarlo lo quita', async ({ page }) => {
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });

    // Horario de Íñigo: solo el martes de 10:00 a 13:00.
    await page.goto('/admin/veterinarios');
    await dismissCookies(page);
    await axeCheck(page);
    await page.getByRole('link', { name: 'Dr. Íñigo Barral' }).click();
    await axeCheck(page);
    await page.getByRole('link', { name: 'Horario semanal' }).click();
    await axeCheck(page);
    const inputs = page.locator('input[type="time"]');
    for (let i = 0; i < (await inputs.count()); i++) await inputs.nth(i).fill('');
    const tuesday = page.getByRole('group', { name: 'Martes' });
    await tuesday.getByLabel('Tramo 1: inicio').fill('10:00');
    await tuesday.getByLabel('Tramo 1: fin').fill('13:00');
    await page.getByRole('button', { name: 'Guardar horario' }).click();
    await expect(page.getByRole('status')).toContainText('Cambios guardados');

    // Servicio nuevo de 45 minutos atendido por Íñigo.
    await page.goto('/admin/servicios');
    await axeCheck(page);
    await page.getByRole('link', { name: 'Nuevo servicio' }).click();
    await axeCheck(page);
    await page.getByLabel('Nombre', { exact: true }).fill('Ecografía');
    await page.getByLabel('Duración en minutos').fill('45');
    await page.getByRole('group', { name: 'Veterinarios que lo atienden' }).getByLabel('Dr. Íñigo Barral').check();
    await page.getByRole('button', { name: 'Guardar servicio' }).click();
    await expect(page).toHaveURL(/\/admin\/servicios\?aviso=guardado/);
    await expect(page.getByRole('status')).toContainText('Cambios guardados');

    expect(await freeTimes(page, 'ecografia', 'inigo-barral')).toEqual(['10:00', '10:30', '11:00', '11:30', '12:00']);

    // Desactivarlo: deja de ofrecerse.
    await page.goto('/admin/servicios');
    await page.getByRole('link', { name: 'Ecografía' }).click();
    await axeCheck(page);
    await page.getByLabel('Activo (se ofrece en la reserva online)').uncheck();
    await page.getByRole('button', { name: 'Guardar servicio' }).click();
    await expect(page.getByRole('status')).toContainText('Cambios guardados');
    await page.goto('/pide-cita');
    await expect(page.getByLabel('Tipo de servicio').locator('option', { hasText: 'Ecografía' })).toHaveCount(0);
  });

  test('un veterinario nuevo sin horario figura con el aviso y no recibe reservas', async ({ page }) => {
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto('/admin/veterinarios/nuevo');
    await dismissCookies(page);
    await axeCheck(page);
    await page.getByLabel('Nombre visible').fill('Dra. Carla Ruiz');
    await page.getByRole('group', { name: 'Servicios que atiende' }).getByLabel('Consulta general').check();
    await page.getByRole('button', { name: 'Guardar veterinario' }).click();
    await expect(page.getByRole('status')).toContainText('Cambios guardados');
    await page.goto('/admin/veterinarios');
    await expect(page.getByRole('row', { name: /Dra\. Carla Ruiz/ })).toContainText('Sin horario: no recibe reservas');
    expect(await freeTimes(page, 'consulta-general', 'dra-carla-ruiz')).toEqual([]);
    await page.goto('/la-clinica');
    await expect(page.getByText('Dra. Carla Ruiz')).toHaveCount(0);
  });

  test('un horario con errores se rechaza junto al campo sin guardar nada', async ({ page }) => {
    await loginAsNew(page, { admin: true, now: new Date(BOOKING_NOW) });
    await page.goto('/admin/veterinarios');
    await dismissCookies(page);
    await page.getByRole('link', { name: 'Dr. Íñigo Barral' }).click();
    await page.getByRole('link', { name: 'Horario semanal' }).click();
    const monday = page.getByRole('group', { name: 'Lunes' });
    await monday.getByLabel('Tramo 1: inicio').fill('12:00');
    await monday.getByLabel('Tramo 1: fin').fill('11:00');
    await page.getByRole('button', { name: 'Guardar horario' }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText('Lunes, tramo 1: fin');
    await expect(monday.getByLabel('Tramo 1: fin')).toHaveAttribute('aria-invalid', 'true');
    await axeCheck(page);
  });
});
