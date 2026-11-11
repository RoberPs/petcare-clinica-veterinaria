import type { Page } from '@playwright/test';
import { testEnv } from '../test-env';
import { query, resetContactState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, isNoJs, test } from './fixtures';

let counter = 0;
const uniqueEmail = () => `visitante-${Date.now()}-${counter++}@example.test`;

async function fillValid(page: Page, email: string) {
  await page.locator('input[name="nombre"]').fill('Lucía Prueba');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Motivo').selectOption({ label: 'Consulta sobre una cita' });
  await page.getByLabel('Mensaje').fill('Quería saber si puedo adelantar la revisión anual.');
  await page.getByRole('checkbox', { name: /política de privacidad/ }).check();
}

const countMessages = async (email: string) =>
  (await query<{ n: number }>('SELECT count(*)::int AS n FROM contact_messages WHERE email = $1', [email]))[0]!.n;

test.describe('US5 · formulario de contacto', () => {
  test.beforeEach(async ({ page }) => {
    await resetContactState();
    await page.goto('/contacto');
    await dismissCookies(page);
  });

  test('envío válido: confirmación, 1 mensaje, correo a la clínica y acuse sin el texto', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name), 'el perfil sin JavaScript tiene su propia prueba');
    const email = uniqueEmail();
    await fillValid(page, email);
    await page.waitForTimeout(3_100); // tiempo mínimo del formulario (R6)
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    const success = page.getByRole('status').filter({ hasText: 'Mensaje enviado' });
    await expect(success).toBeVisible();
    await expect(success).toContainText('en un plazo de 24 horas laborables');
    expect(await countMessages(email)).toBe(1);
    await expect.poll(async () => (await fakeEmails.to(email)).length, { timeout: 15_000 }).toBe(1);
    await expect.poll(async () => (await fakeEmails.to(testEnv.CLINIC_INBOX_EMAIL)).some((e) => e.body.replyTo?.email === email)).toBe(true);
    const [ack] = await fakeEmails.to(email);
    expect(ack!.body.textContent).not.toContain('adelantar la revisión');
    await axeCheck(page);
  });

  test('correo inválido: error junto al campo, foco, aria-invalid y datos conservados', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name), 'sin JavaScript valida el navegador');
    await fillValid(page, 'no-es-un-correo');
    await page.waitForTimeout(3_100);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    const email = page.getByLabel('Correo electrónico');
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#email-error')).toHaveText('Escribe un correo válido, por ejemplo nombre@correo.es.');
    await expect(email).toHaveAttribute('aria-describedby', /email-error/);
    await expect(page.locator('.form-summary')).toContainText('Revisa este campo');
    await expect(page.locator('input[name="nombre"]')).toHaveValue('Lucía Prueba');
    await expect(page.getByLabel('Mensaje')).toHaveValue('Quería saber si puedo adelantar la revisión anual.');
    await expect(email).toHaveValue('no-es-un-correo');
    await axeCheck(page);
  });

  test('campos vacíos: el foco va al primer error', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name), 'sin JavaScript valida el navegador');
    await page.waitForTimeout(3_100);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.locator('input[name="nombre"]')).toBeFocused();
    await expect(page.locator('#nombre-error')).toHaveText('Escribe tu nombre.');
    await expect(page.locator('#privacidad-error')).toBeVisible();
    await expect(page.locator('.form-summary')).toContainText(testEnv.CLINIC_PHONE_DISPLAY);
  });

  test('doble clic → 1 mensaje; "Enviando…" con la red lenta', async ({ page }, info) => {
    test.skip(isNoJs(info.project.name), 'requiere JavaScript');
    const email = uniqueEmail();
    await page.route('**/contacto', async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 1_500));
      await route.continue();
    });
    await fillValid(page, email);
    await page.waitForTimeout(3_100);
    const button = page.getByRole('button', { name: 'Enviar mensaje' });
    await button.dblclick();
    await expect(page.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: 'Mensaje enviado' })).toBeVisible();
    expect(await countMessages(email)).toBe(1);
  });

  test('teléfono marcado como opcional y contador de 2.000 caracteres', async ({ page }, info) => {
    await expect(page.locator('#campo-telefono')).toContainText('(opcional)');
    await expect(page.getByLabel('Mensaje')).toHaveAttribute('maxlength', '2000');
    await expect(page.getByRole('link', { name: 'política de privacidad', exact: true })).toHaveAttribute('href', '/privacidad');
    if (isNoJs(info.project.name)) {
      await expect(page.locator('#mensaje-hint')).toHaveText('Entre 10 y 2.000 caracteres.');
      return;
    }
    await page.getByLabel('Mensaje').fill('Hola, ¿qué tal?');
    await expect(page.locator('#mensaje-hint')).toHaveText('15 de 2000 caracteres');
  });

  test('sin JavaScript: el envío redirige a /contacto/enviado y recargar no duplica', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo perfil sin JavaScript');
    const email = uniqueEmail();
    await fillValid(page, email);
    await page.waitForTimeout(3_100);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page).toHaveURL(/\/contacto\/enviado$/);
    await expect(page.getByRole('status')).toContainText('en un plazo de 24 horas laborables');
    await page.reload();
    await expect(page).toHaveURL(/\/contacto\/enviado$/);
    expect(await countMessages(email)).toBe(1);
    await axeCheck(page);
  });
});
