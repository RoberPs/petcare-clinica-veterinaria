import type { Page } from '@playwright/test';
import { loadPetcare, query, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, test } from './fixtures';

// US7 (feature 005) · pagar en la clínica: solo con recogida, pedido pendiente con reserva y plazo,
// carrito vacío y correos al comprador y a la clínica. También sin JavaScript.

const SLUG = 'pienso-perro-adulto';
const BUYER = 'comprador-us7@example.test';
const CLINIC_INBOX = 'buzon-clinica@example.test';

async function addAndGoToCheckout(page: Page) {
  await page.goto(`/productos/${SLUG}`);
  await dismissCookies(page);
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await expect(page).toHaveURL(/aviso=carrito-/);
  await page.goto('/finalizar-compra');
}

async function fillContact(page: Page) {
  await page.getByLabel('Correo electrónico', { exact: true }).fill(BUYER);
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
}

async function emailTo(address: string, subject: RegExp, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await fakeEmails.to(address)).filter((e) => subject.test(e.body.subject ?? ''));
    if (found.length > 0) return found[found.length - 1]!;
    if (Date.now() > deadline) throw new Error(`No ha llegado el correo ${subject} a ${address}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.describe('US7 · pagar en la clínica', () => {
  test.beforeAll(async () => {
    await loadPetcare();
  });
  test.beforeEach(async () => {
    await resetShopState();
    await fakeEmails.clear();
    await query(`UPDATE products SET stock = 14 WHERE slug = $1`, [SLUG]);
  });
  test.afterAll(async () => {
    await resetShopState();
  });

  test('con envío a domicilio: error junto al campo de pago', async ({ page }) => {
    await addAndGoToCheckout(page);
    await fillContact(page);
    await page.getByRole('group', { name: 'Método de envío' }).getByRole('radio', { name: /Envío a domicilio/ }).check();
    await page.getByLabel('Dirección', { exact: true }).fill('Calle de la Prueba 3');
    await page.getByLabel('Código postal', { exact: true }).fill('28001');
    await page.getByLabel('Ciudad', { exact: true }).fill('Madrid');
    await page.getByRole('group', { name: 'Método de pago' }).getByRole('radio', { name: /Pago en la clínica/ }).check();
    await page.waitForTimeout(3_200);
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page).toHaveURL(/\/finalizar-compra$/);
    await expect(page.locator('#payment_method-error')).toHaveText('El pago en clínica solo está disponible con recogida en la clínica');
    await expect(page.locator('.form-summary[role="alert"]')).toBeVisible();
    const [{ n }] = (await query<{ n: string }>(`SELECT count(*)::text AS n FROM orders`)) as [{ n: string }];
    expect(n).toBe('0');
    await axeCheck(page);
  });

  test('con recogida: pedido recibido con el plazo, stock reservado, carrito vacío y dos correos', async ({ page }) => {
    await addAndGoToCheckout(page);
    await fillContact(page);
    await page.getByRole('group', { name: 'Método de envío' }).getByRole('radio', { name: /Recogida en la clínica/ }).check();
    await page.getByRole('group', { name: 'Método de pago' }).getByRole('radio', { name: /Pago en la clínica/ }).check();
    await page.waitForTimeout(3_200);
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page).toHaveURL(/\/pedido\/confirmado\?ref=/);
    const heading = page.getByRole('heading', { level: 1, name: /^Pedido PC-\d+ recibido$/ });
    await expect(heading).toBeVisible();
    await expect(page.getByText('Estado: Pendiente de pago')).toBeVisible();
    await expect(page.getByText('Pago: Pago en la clínica (pendiente)')).toBeVisible();
    await expect(page.getByText(/^Recógelo antes del .+ \(incluido\)\.$/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Carrito, 0 productos' })).toBeVisible();
    await axeCheck(page);

    const [o] = await query<{ status: string; reservation_status: string; pickup_deadline: Date | null }>(
      'SELECT status, reservation_status, pickup_deadline FROM orders',
    );
    expect(o).toMatchObject({ status: 'pending_payment', reservation_status: 'held' });
    expect(o!.pickup_deadline).not.toBeNull();
    const [{ stock }] = (await query<{ stock: number }>('SELECT stock FROM products WHERE slug = $1', [SLUG])) as [{ stock: number }];
    expect(stock).toBe(13);
    expect(await query('SELECT count(*)::int AS n FROM payments')).toEqual([{ n: 0 }]);

    const number = (await heading.textContent())!.match(/PC-\d+/)![0];
    const received = await emailTo(BUYER, new RegExp(`^Pedido ${number} recibido: pago en la clínica$`));
    expect(received.body.textContent).toContain('Recógelo antes del');
    expect(received.body.textContent).toContain('Pago en la clínica (pendiente)');
    await emailTo(CLINIC_INBOX, new RegExp(`^Nuevo pedido ${number}$`));
  });
});
