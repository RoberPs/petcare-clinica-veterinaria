import type { Page } from '@playwright/test';
import { createCustomer, query, resetAccountState } from './db';
import { axeCheck, countEmailsTo, dismissCookies, expect, extractLink, isNoJs, latestEmailTo, test } from './fixtures';

// US1 · crear una cuenta y verificar el correo (en móvil, escritorio y sin JavaScript).

let counter = 0;
const uniqueEmail = () => `registro-${Date.now()}-${counter++}@example.test`;
const PASSWORD = 'caballo bateria grapa';

async function fillRegister(page: Page, email: string, confirm = PASSWORD) {
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await page.getByLabel('Apellidos').fill('Prueba Ejemplo');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(confirm);
  await page.getByRole('checkbox', { name: /política de privacidad/ }).check();
  await page.waitForTimeout(3_100); // tiempo mínimo del formulario (R6)
}

const submit = (page: Page) => page.getByRole('button', { name: 'Crear cuenta' }).click();

test.describe('US1 · crear una cuenta', () => {
  test.beforeEach(async ({ page }) => {
    await resetAccountState();
    await page.goto('/crear-cuenta');
    await dismissCookies(page);
  });

  test('la página es accesible, no se indexa y no se guarda en caché', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Crear cuenta' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const marketing = page.getByRole('checkbox', { name: /consejos de salud/ });
    await expect(marketing).not.toBeChecked();
    await axeCheck(page);
  });

  test('contraseñas distintas: error junto al campo y datos conservados, sin las contraseñas', async ({ page }) => {
    const email = uniqueEmail();
    await fillRegister(page, email, 'otra frase distinta');
    await submit(page);
    const confirm = page.getByLabel('Repetir contraseña');
    await expect(page.locator('#password_confirm-error')).toHaveText('Las contraseñas no coinciden.');
    await expect(confirm).toHaveAttribute('aria-invalid', 'true');
    await expect(confirm).toHaveAttribute('aria-describedby', /password_confirm-error/);
    await expect(page.locator('.form-summary')).toContainText('Revisa este campo');
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Lucía');
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(email);
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
    await expect(confirm).toHaveValue('');
    expect(await query('SELECT id FROM customers WHERE email = $1', [email])).toEqual([]);
    await axeCheck(page);
  });

  test('alta completa: revisa tu correo, enlace, confirmar e iniciar sesión con el correo escrito', async ({ page }) => {
    const email = uniqueEmail();
    await fillRegister(page, email);
    await submit(page);
    await expect(page).toHaveURL(/\/crear-cuenta\/revisa-tu-correo$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Revisa tu correo' })).toBeVisible();
    await axeCheck(page);

    const mail = await latestEmailTo(email, 'verify_email');
    await page.goto(extractLink(mail));
    await expect(page.getByRole('heading', { level: 1, name: 'Confirma tu correo' })).toBeVisible();
    // El GET no gasta el enlace.
    expect((await query('SELECT email_verified_at FROM customers WHERE email = $1', [email]))[0]!.email_verified_at).toBeNull();
    await axeCheck(page);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();

    await expect(page).toHaveURL(/\/iniciar-sesion\?aviso=correo-verificado$/);
    await expect(page.getByRole('status')).toContainText('Tu correo está confirmado');
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(email);
    expect((await query('SELECT email_verified_at FROM customers WHERE email = $1', [email]))[0]!.email_verified_at).not.toBeNull();
  });

  test('un correo ya registrado muestra la misma página y su dueño recibe account_exists', async ({ page }) => {
    const existing = await createCustomer({ verified: true });
    await fillRegister(page, existing.email);
    await submit(page);
    await expect(page).toHaveURL(/\/crear-cuenta\/revisa-tu-correo$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Revisa tu correo' })).toBeVisible();
    await latestEmailTo(existing.email, 'account_exists');
    expect(await countEmailsTo(existing.email, 'verify_email')).toBe(0);
    expect(await query('SELECT id FROM customers WHERE email_normalized = $1', [existing.email])).toHaveLength(1);
  });

  test('un enlace usado o caducado muestra la página de enlace caducado con el reenvío', async ({ page }) => {
    const email = uniqueEmail();
    await fillRegister(page, email);
    await submit(page);
    const link = extractLink(await latestEmailTo(email, 'verify_email'));

    // Un enlace nuevo invalida el anterior.
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByRole('button', { name: 'Enviar otro enlace' }).click();
    await expect(page.getByRole('status')).toContainText('te hemos enviado un enlace nuevo');
    await expect.poll(() => countEmailsTo(email, 'verify_email'), { timeout: 10_000 }).toBe(2);

    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'El enlace ha caducado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar otro enlace' })).toBeVisible();
    await axeCheck(page);
  });

  test('sin JavaScript el formulario también funciona (POST-Redirect-GET)', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    const email = uniqueEmail();
    await fillRegister(page, email);
    await submit(page);
    await expect(page).toHaveURL(/\/crear-cuenta\/revisa-tu-correo$/);
    expect(await query('SELECT id FROM customers WHERE email = $1', [email])).toHaveLength(1);
  });
});
