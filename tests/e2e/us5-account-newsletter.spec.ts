import type { Page } from '@playwright/test';
import { unsubscribeToken } from '../../src/lib/newsletter/tokens';
import { testEnv } from '../test-env';
import { createCustomer, query, resetAccountState } from './db';
import { axeCheck, countEmailsTo, dismissCookies, expect, extractLink, latestEmailTo, loginAs, test } from './fixtures';

// US5 de la 006: la preferencia "consejos y novedades" de la cuenta y la lista del boletín
// coinciden en ambos sentidos (E11).

// El enlace de baja se firma aquí con el mismo FORM_SECRET que usa el servidor de pruebas: en el
// alta desde la cuenta no se envía ningún correo del boletín (FR-024).
// Se fuerza (no `??=`): el token se firma aquí y debe usar la misma clave que el servidor de
// Playwright (`testEnv`), aunque el entorno (la CI) defina otro FORM_SECRET.
process.env.FORM_SECRET = testEnv.FORM_SECRET;

let counter = 0;
const uniqueEmail = () => `cuenta-boletin-${Date.now()}-${counter++}@example.test`;
const PASSWORD = 'caballo bateria grapa';
const marketingBox = (page: Page) => page.getByRole('checkbox', { name: /consejos de salud/ });

test.describe('US5 · cuenta y boletín', () => {
  test.beforeEach(async ({ page }) => {
    await resetAccountState();
    await page.goto('/crear-cuenta');
    await dismissCookies(page);
  });

  test('registro con la casilla, verificación, preferencia activa y baja desde el enlace', async ({ page }) => {
    const email = uniqueEmail();
    await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
    await page.getByLabel('Apellidos').fill('Prueba Ejemplo');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Repetir contraseña').fill(PASSWORD);
    await page.getByRole('checkbox', { name: /política de privacidad/ }).check();
    await marketingBox(page).check();
    await page.waitForTimeout(3_100); // tiempo mínimo del formulario (R6)
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/crear-cuenta\/revisa-tu-correo$/);

    // Sin verificar, nada en la lista.
    expect(await query('SELECT id FROM newsletter_subscriptions WHERE email = $1', [email])).toEqual([]);

    await page.goto(extractLink(await latestEmailTo(email, 'verify_email')));
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion\?aviso=correo-verificado$/);

    const [sub] = await query<{ id: string; status: string; source: string; customer_id: string }>(
      'SELECT id, status, source, customer_id FROM newsletter_subscriptions WHERE email = $1',
      [email],
    );
    expect(sub).toMatchObject({ status: 'confirmed', source: 'account' });
    expect(await countEmailsTo(email, 'newsletter_confirm')).toBe(0);

    await loginAs(page, { id: sub!.customer_id });
    await page.goto('/mi-cuenta/datos');
    await expect(marketingBox(page)).toBeChecked();
    await axeCheck(page);

    await page.goto(`/boletin/baja?t=${encodeURIComponent(unsubscribeToken(sub!.id))}`);
    await page.getByRole('button', { name: 'Darme de baja' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Te has dado de baja');

    await page.goto('/mi-cuenta/datos');
    await expect(marketingBox(page)).not.toBeChecked();
    expect(await query('SELECT id FROM newsletter_subscriptions WHERE email = $1', [email])).toEqual([]);
    expect(
      await query('SELECT reason FROM newsletter_unsubscribe_records ORDER BY unsubscribed_at DESC LIMIT 1'),
    ).toEqual([{ reason: 'link' }]);
    await axeCheck(page);
  });

  test('desactivar en "Datos personales" saca de la lista', async ({ page }) => {
    const customer = await createCustomer({ verified: true });
    await loginAs(page, customer);
    await page.goto('/mi-cuenta/datos');
    await marketingBox(page).check();
    await page.getByRole('button', { name: 'Guardar la preferencia' }).click();
    await expect
      .poll(async () => query('SELECT status FROM newsletter_subscriptions WHERE customer_id = $1', [customer.id]))
      .toEqual([{ status: 'confirmed' }]);

    await page.goto('/mi-cuenta/datos');
    await marketingBox(page).uncheck();
    await page.getByRole('button', { name: 'Guardar la preferencia' }).click();
    await expect
      .poll(async () => query('SELECT id FROM newsletter_subscriptions WHERE customer_id = $1', [customer.id]))
      .toEqual([]);
    await page.goto('/mi-cuenta/datos');
    await expect(marketingBox(page)).not.toBeChecked();
  });
});
