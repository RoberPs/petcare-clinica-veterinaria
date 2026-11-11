import type { Locator, Page } from '@playwright/test';
import { createCustomer, createPet, query, resetAccountState, resetBookingState } from './db';
import { BOOKING_NOW, dismissCookies, expect, isNoJs, loginAs, test } from './fixtures';

// SC-006 y principio V: la reserva de invitado, la de cliente, el cambio y la cancelación solo con
// el teclado (Tab, Mayús+Tab, Enter, Espacio y letras), con el foco siempre visible.

/** Pulsa Tab hasta que `target` tiene el foco y comprueba que el foco se ve (en una hora, en su .slot). */
async function tabTo(page: Page, target: Locator, max = 120): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) {
      const outline = await target.evaluate((el) => {
        const shown = (el as HTMLInputElement).type === 'radio' ? (el.nextElementSibling as HTMLElement) : el;
        const s = getComputedStyle(shown);
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
      });
      expect((outline.style !== 'none' && outline.width > 0) || outline.shadow !== 'none', 'foco visible').toBe(true);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error('No se ha llegado al elemento con el tabulador');
}

async function typeInto(page: Page, field: Locator, text: string): Promise<void> {
  await tabTo(page, field);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
}

async function press(page: Page, target: Locator, key: 'Enter' | 'Space'): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

test.describe('reserva · solo con el teclado', () => {
  test.beforeEach(async ({ bookingClock }, info) => {
    test.skip(info.project.name === 'mobile-360', 'en escritorio y sin JavaScript');
    expect(bookingClock).toBeTruthy();
    await resetAccountState();
    await resetBookingState();
  });

  test('reserva de invitado con un primer envío no válido', async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.goto('/pide-cita');
    await dismissCookies(page);

    // Paso 1: el selector se elige escribiendo (búsqueda por letras de la lista).
    await tabTo(page, page.getByLabel('Tipo de servicio'));
    await page.keyboard.type('Consulta');
    await expect(page.getByLabel('Tipo de servicio')).toHaveValue('consulta-general');
    await press(page, page.getByRole('button', { name: 'Continuar' }), 'Enter');

    // Paso 2: el día por defecto es el primero con huecos; la primera hora libre con Espacio.
    const firstSlot = page.getByRole('group', { name: 'Horas disponibles' }).getByRole('radio').first();
    await press(page, firstSlot, 'Space');
    await expect(firstSlot).toBeChecked();
    await press(page, page.getByRole('button', { name: 'Continuar' }), 'Enter');

    // Paso 3, con un teléfono no válido.
    await expect(page.locator('[aria-current="step"]')).toHaveText('3 Tus datos');
    await typeInto(page, page.getByLabel('Nombre de la mascota'), 'Lúa');
    await tabTo(page, page.getByLabel('Especie'));
    await page.keyboard.type('Perro');
    await typeInto(page, page.getByLabel('Nombre y apellidos'), 'Persona Teclado');
    await typeInto(page, page.getByLabel('Teléfono'), '123');
    await typeInto(page, page.getByLabel('Correo electrónico'), `teclado-${info.project.name}@example.test`);
    await press(page, page.getByRole('checkbox', { name: /acepto la política de privacidad/ }), 'Space');
    await page.waitForTimeout(3_200);
    await press(page, page.getByRole('button', { name: 'Confirmar cita' }), 'Enter');
    await expect(page.locator('#telefono-error')).toBeVisible();
    if (!isNoJs(info.project.name)) await expect(page.locator('.form-summary')).toBeFocused();

    // Corrige el teléfono y confirma.
    await page.keyboard.press('Shift+Tab');
    await typeInto(page, page.getByLabel('Teléfono'), '600 123 456');
    const privacy = page.getByRole('checkbox', { name: /acepto la política de privacidad/ });
    if (!(await privacy.isChecked())) await press(page, privacy, 'Space');
    await press(page, page.getByRole('button', { name: 'Confirmar cita' }), 'Enter');
    await expect(page).toHaveURL(/\/pide-cita\/confirmada\?ref=/);
    expect(await query('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 1 }]);
  });

  test('reserva de cliente, cambio y cancelación', async ({ page }) => {
    test.setTimeout(150_000);
    const c = await createCustomer({ phone: '600 111 222' });
    await createPet(c.id, { name: 'Bruno' });
    await loginAs(page, c, false, new Date(BOOKING_NOW));
    await page.goto('/pide-cita?servicio=consulta-general&profesional=sin-preferencia&fecha=2026-11-17&hora=12:00');
    await dismissCookies(page);
    await press(page, page.getByRole('checkbox', { name: /acepto la política de privacidad/ }), 'Space');
    await page.waitForTimeout(3_200);
    await press(page, page.getByRole('button', { name: 'Confirmar cita' }), 'Enter');
    await expect(page).toHaveURL(/\/pide-cita\/confirmada\?ref=/);

    // Cambiar: el tabulador entra en el grupo por la hora actual (marcada) y la flecha pasa a la siguiente.
    await press(page, page.getByRole('link', { name: 'Ver mis citas' }), 'Enter');
    await press(page, page.getByRole('link', { name: /^Cambiar la cita de/ }), 'Enter');
    const group = page.getByRole('group', { name: 'Horas disponibles' });
    await tabTo(page, group.getByRole('radio', { name: '12:00' }));
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: '12:30' })).toBeChecked();
    await press(page, page.getByRole('button', { name: 'Cambiar la cita' }), 'Enter');
    await expect(page).toHaveURL(/aviso=cita-cambiada/);

    // Cancelar.
    await press(page, page.getByRole('link', { name: /^Cancelar la cita de/ }), 'Enter');
    await press(page, page.getByRole('button', { name: 'Sí, cancelar la cita' }), 'Enter');
    await expect(page).toHaveURL(/aviso=cita-cancelada/);
    expect(await query('SELECT status FROM appointments')).toEqual([{ status: 'cancelled' }]);
  });
});
