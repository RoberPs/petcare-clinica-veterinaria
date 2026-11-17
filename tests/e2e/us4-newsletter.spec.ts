import type { Page } from '@playwright/test';
import { query, resetAccountState } from './db';
import { axeCheck, countEmailsTo, dismissCookies, expect, isNoJs, latestEmailTo, linkTo, test } from './fixtures';

// US4 de la 006: suscripción con doble confirmación, respuesta uniforme y baja (E8–E10, E16).

let counter = 0;
const uniqueEmail = () => `boletin-${Date.now()}-${counter++}@example.test`;
const SENT = /Revisa tu correo: si la dirección es correcta/;

async function fillNewsletter(page: Page, email: string, accept = true) {
  const block = page.locator('#boletin');
  await block.getByLabel('Correo electrónico').fill(email);
  if (accept) await block.getByRole('checkbox', { name: /política del boletín/ }).check();
  await page.waitForTimeout(3_100); // tiempo mínimo del formulario (R6)
  await block.getByRole('button', { name: 'Suscribirme' }).click();
}

test.describe('US4 · boletín', () => {
  test.beforeEach(async ({ page }) => {
    await resetAccountState();
    await page.goto('/');
    await dismissCookies(page);
  });

  test('el bloque está en la portada y en /consejos, con la casilla desmarcada y la política', async ({ page }) => {
    for (const path of ['/', '/consejos']) {
      await page.goto(path);
      const block = page.locator('section.newsletter#boletin');
      await expect(block.getByRole('heading', { level: 2 })).toHaveText('Recibe nuestros consejos por correo');
      await expect(block.getByRole('checkbox', { name: /política del boletín/ })).not.toBeChecked();
      await expect(block.getByRole('link', { name: 'política del boletín' })).toHaveAttribute('href', '/politica-del-boletin');
      await axeCheck(page);
    }
  });

  test('errores junto al campo y anunciados', async ({ page }) => {
    test.skip(isNoJs(test.info().project.name), 'sin JavaScript, el navegador valida antes de enviar');
    await fillNewsletter(page, 'no-es-un-correo', false);
    const block = page.locator('#boletin');
    await expect(block.getByRole('alert')).toContainText('Revisa estos 2 campos');
    await expect(block.getByLabel('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#boletin-email-error')).toHaveText('Escribe un correo válido, por ejemplo nombre@dominio.es.');
    await expect(page.locator('#boletin-politica-error')).toHaveText('Para suscribirte debes aceptar la política del boletín.');
    await axeCheck(page);
  });

  test('alta, confirmación desde el correo y baja desde el enlace', async ({ page }) => {
    const email = uniqueEmail();
    await fillNewsletter(page, email);
    // Con JavaScript, Next.js no conserva #boletin al redirigir: el mensaje recibe el foco.
    await expect(page).toHaveURL(/\/\?aviso=boletin-revisa-correo(#boletin)?$/);
    await expect(page.locator('#boletin').getByRole('status')).toHaveText(SENT);
    if (!isNoJs(test.info().project.name)) await expect(page.locator('#boletin').getByRole('status')).toBeFocused();

    const mail = await latestEmailTo(email, 'newsletter_confirm');
    expect(mail.body.headers?.['List-Unsubscribe']).toMatch(/\/api\/boletin\/baja\?t=/);
    expect(mail.body.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    // El GET no confirma: hay que pulsar el botón.
    await page.goto(linkTo(mail, '/boletin/confirmar'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confirma tu suscripción');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await axeCheck(page);
    expect(await query(`SELECT status FROM newsletter_subscriptions WHERE email = $1`, [email])).toEqual([{ status: 'pending' }]);
    await page.getByRole('button', { name: 'Confirmar suscripción' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Suscripción confirmada');
    await expect(page.locator('.status-ok')).toBeVisible();
    await axeCheck(page);

    // Repetir el alta con el mismo correo: mismo mensaje y ningún correo nuevo.
    await page.goto('/consejos');
    await fillNewsletter(page, email);
    await expect(page).toHaveURL(/\/consejos\?aviso=boletin-revisa-correo(#boletin)?$/);
    await expect(page.locator('#boletin').getByRole('status')).toHaveText(SENT);
    expect(await countEmailsTo(email, 'newsletter_confirm')).toBe(1);

    await page.goto(linkTo(mail, '/boletin/baja'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Darte de baja del boletín');
    await axeCheck(page);
    await page.getByRole('button', { name: 'Darme de baja' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Te has dado de baja');
    expect(await query(`SELECT id FROM newsletter_subscriptions WHERE email = $1`, [email])).toEqual([]);
    await page.goto(linkTo(mail, '/boletin/baja'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ya no estás suscrito');
  });

  test('enlace caducado o no válido: un solo estado con formulario para pedir otro', async ({ page }) => {
    await page.goto('/boletin/confirmar?t=manipulado');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('El enlace ha caducado o no es válido');
    await expect(page.getByRole('button', { name: 'Enviarme otro enlace' })).toBeVisible();
    await axeCheck(page);
    await page.getByLabel('Correo electrónico').fill(uniqueEmail());
    await page.waitForTimeout(3_100);
    await page.getByRole('button', { name: 'Enviarme otro enlace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revisa tu correo');

    await page.goto('/boletin/baja?t=manipulado');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('El enlace de baja no es válido');
    await axeCheck(page);
  });

  test('la política del boletín está publicada y enlazada en el pie', async ({ page }) => {
    await page.getByRole('contentinfo').getByRole('link', { name: 'Política del boletín' }).click();
    await expect(page).toHaveURL(/\/politica-del-boletin$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await axeCheck(page);
  });

  test('sin JavaScript: PRG con el aviso en el bloque', async ({ page }, info) => {
    test.skip(!isNoJs(info.project.name), 'solo en el perfil sin JavaScript');
    await fillNewsletter(page, uniqueEmail());
    await expect(page).toHaveURL(/aviso=boletin-revisa-correo#boletin$/);
    await expect(page.locator('#boletin').getByRole('status')).toHaveText(SENT);
  });
});
