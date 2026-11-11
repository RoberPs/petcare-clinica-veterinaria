import type { Locator, Page } from '@playwright/test';
import { query, resetAccountState } from './db';
import { dismissCookies, expect, extractLink, isNoJs, latestEmailTo, test } from './fixtures';

// SC-007 y principio V: todo el ciclo de la cuenta solo con el teclado (Tab, Mayús+Tab, Enter y
// Espacio, sin clics), con el foco siempre visible.

const PASSWORD = 'caballo bateria grapa';

/** Pulsa Tab hasta que `target` tiene el foco y comprueba que el foco se ve. */
async function tabTo(page: Page, target: Locator, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) {
      const outline = await target.evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
      });
      expect(outline.style !== 'none' && outline.width > 0 || outline.shadow !== 'none', 'foco visible').toBe(true);
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

test.describe('cuenta · solo con el teclado', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('registro, confirmación, acceso con "Recordarme", mascota y borrado de la cuenta', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-360', 'en escritorio y sin JavaScript');
    test.setTimeout(120_000);
    const email = `teclado-${Date.now()}@example.test`;

    // 1. Registro, con un primer envío no válido.
    await page.goto('/crear-cuenta');
    await dismissCookies(page);
    await typeInto(page, page.getByLabel('Nombre', { exact: true }), 'Lucía');
    await typeInto(page, page.getByLabel('Apellidos'), 'Teclado');
    await typeInto(page, page.getByLabel('Correo electrónico'), email);
    await typeInto(page, page.getByLabel('Contraseña', { exact: true }), PASSWORD);
    await typeInto(page, page.getByLabel('Repetir contraseña'), 'otra frase distinta');
    await tabTo(page, page.getByRole('checkbox', { name: /política de privacidad/ }));
    await page.keyboard.press('Space');
    await page.waitForTimeout(3_100);
    await tabTo(page, page.getByRole('button', { name: 'Crear cuenta' }));
    await page.keyboard.press('Enter');
    await expect(page.locator('#password_confirm-error')).toBeVisible();
    if (!isNoJs(info.project.name)) await expect(page.locator('.form-summary')).toBeFocused();

    // Corrige las contraseñas (sin JavaScript hay que volver a marcar la casilla y esperar el token).
    await page.keyboard.press('Shift+Tab'); // el foco vuelve atrás sin salir de la página
    await typeInto(page, page.getByLabel('Contraseña', { exact: true }), PASSWORD);
    await typeInto(page, page.getByLabel('Repetir contraseña'), PASSWORD);
    const terms = page.getByRole('checkbox', { name: /política de privacidad/ });
    if (!(await terms.isChecked())) {
      await tabTo(page, terms);
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(3_100);
    await tabTo(page, page.getByRole('button', { name: 'Crear cuenta' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/crear-cuenta\/revisa-tu-correo$/);

    // 2. Confirmación del correo (el enlace llega por correo; se abre con su URL).
    await page.goto(extractLink(await latestEmailTo(email, 'verify_email')));
    await tabTo(page, page.getByRole('button', { name: 'Confirmar mi correo' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/iniciar-sesion\?aviso=correo-verificado$/);

    // 3. Inicio de sesión con "Recordarme" (el correo ya está escrito).
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(email);
    await typeInto(page, page.getByLabel('Contraseña', { exact: true }), PASSWORD);
    await tabTo(page, page.getByRole('checkbox', { name: 'Recordarme' }));
    await page.keyboard.press('Space');
    await tabTo(page, page.getByRole('button', { name: 'Iniciar sesión' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/mi-cuenta$/);

    // 4. Alta de una mascota.
    await tabTo(page, page.getByRole('link', { name: 'Añadir mascota' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/mi-cuenta\/mascotas\/nueva$/);
    await typeInto(page, page.getByLabel('Nombre'), 'Tecla');
    await tabTo(page, page.getByLabel('Especie'));
    await page.keyboard.press('ArrowDown');
    await expect(page.getByLabel('Especie')).not.toHaveValue('');
    await tabTo(page, page.getByLabel('Fecha de nacimiento'));
    await page.keyboard.type('01082022');
    // El orden día/mes del campo depende del idioma del navegador: 1 de agosto o 8 de enero.
    await expect(page.getByLabel('Fecha de nacimiento')).toHaveValue(/^2022-(08-01|01-08)$/);
    await tabTo(page, page.getByRole('button', { name: 'Añadir mascota' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/aviso=mascota-anadida$/);

    // 5. Eliminación de la mascota, con su página de confirmación.
    await tabTo(page, page.getByRole('link', { name: 'Eliminar a Tecla' }));
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('button', { name: 'Eliminar a Tecla' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/aviso=mascota-eliminada$/);

    // 6. Eliminación de la cuenta.
    await tabTo(page, page.getByRole('navigation', { name: 'Mi cuenta' }).getByRole('link', { name: 'Datos personales' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/mi-cuenta\/datos$/);
    await tabTo(page, page.getByRole('link', { name: 'Eliminar mi cuenta' }));
    await page.keyboard.press('Enter');
    await typeInto(page, page.getByLabel('Escribe tu contraseña para confirmar'), PASSWORD);
    await tabTo(page, page.getByRole('button', { name: 'Eliminar mi cuenta' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/\?aviso=cuenta-eliminada$/);
    expect(await query('SELECT id FROM customers WHERE email = $1', [email])).toEqual([]);
  });
});
