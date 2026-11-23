import type { Page } from '@playwright/test';
import { loadPetcare, loadPetcarePeninsula, query, resetShopState } from './db';
import { axeCheck, dismissCookies, expect, fakeEmails, test } from './fixtures';

// US4 (feature 005) · envío a domicilio o recogida en la clínica. Sin JavaScript la dirección no se
// oculta: el servidor la exige solo con envío a domicilio y la descarta con recogida.

const SLUG = 'pienso-perro-adulto';
const BUYER = 'comprador-us4@example.test';

async function addAndGoToCheckout(page: Page) {
  await page.goto(`/productos/${SLUG}`);
  await dismissCookies(page);
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await expect(page).toHaveURL(/aviso=carrito-/);
  await page.goto('/carrito');
  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(page).toHaveURL(/\/finalizar-compra$/);
}

async function fillContact(page: Page) {
  await page.getByLabel('Correo electrónico', { exact: true }).fill(BUYER);
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
}

async function clinicAddress(): Promise<string> {
  const [c] = await query<{ address_line: string; postal_code: string; city: string }>(
    'SELECT address_line, postal_code, city FROM clinic LIMIT 1',
  );
  return `${c!.address_line}, ${c!.postal_code} ${c!.city}`;
}

async function emailWithSubject(subject: RegExp, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await fakeEmails.to(BUYER)).filter((e) => subject.test(e.body.subject ?? ''));
    if (found.length > 0) return found[found.length - 1]!;
    if (Date.now() > deadline) throw new Error(`No ha llegado el correo ${subject}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.describe('US4 · envío o recogida', () => {
  test.beforeEach(async () => {
    await resetShopState();
    await fakeEmails.clear();
    await query(`UPDATE products SET stock = 14 WHERE slug = $1`, [SLUG]);
  });
  test.afterAll(async () => {
    await resetShopState();
    await loadPetcare();
  });

  test.describe('envío solo a la península', () => {
    test.beforeAll(async () => {
      await loadPetcarePeninsula();
    });

    test('cada opción con nombre, plazo y coste; fuera de zona → aviso de recogida', async ({ page }) => {
      await addAndGoToCheckout(page);
      const shipping = page.getByRole('group', { name: 'Método de envío' });
      const home = shipping.getByRole('radio', { name: /Envío a domicilio/ });
      const pickup = shipping.getByRole('radio', { name: /Recogida en la clínica/ });
      await expect(home).toBeVisible();
      await expect(pickup).toBeVisible();
      await expect(shipping.locator('.option').filter({ hasText: 'Envío a domicilio' })).toContainText('Entrega en 24-48 h');
      await expect(shipping.locator('.option').filter({ hasText: 'Envío a domicilio' }).locator('.option__price')).toHaveText('Gratis');
      await expect(page.getByRole('group', { name: 'Dirección de envío' })).toContainText('Solo para envío a domicilio');
      await axeCheck(page);

      await fillContact(page);
      await home.check();
      await page.getByLabel('Dirección', { exact: true }).fill('Calle Mayor 5');
      await page.getByLabel('Código postal', { exact: true }).fill('35001');
      await page.getByLabel('Ciudad', { exact: true }).fill('Las Palmas');
      await page.waitForTimeout(3_200);
      await page.getByRole('button', { name: 'Confirmar pedido' }).click();

      await expect(page).toHaveURL(/\/finalizar-compra$/);
      await expect(page.locator('#postal_code-error')).toHaveText('No enviamos a este código postal. Puedes recogerlo en la clínica.');
      await expect(page.getByLabel('Código postal', { exact: true })).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('.form-summary[role="alert"]')).toBeVisible();
      const [{ n }] = (await query<{ n: string }>(`SELECT count(*)::text AS n FROM orders`)) as [{ n: string }];
      expect(n).toBe('0');
      await axeCheck(page);
    });
  });

  test.describe('recogida en la clínica', () => {
    test.beforeAll(async () => {
      await loadPetcare();
    });

    test('pedido sin dirección, con la dirección y el horario de la clínica en la confirmación y el correo', async ({ page }) => {
      await addAndGoToCheckout(page);
      await fillContact(page);
      await page.getByRole('group', { name: 'Método de envío' }).getByRole('radio', { name: /Recogida en la clínica/ }).check();
      await page.getByRole('group', { name: 'Método de pago' }).getByRole('radio', { name: /Tarjeta/ }).check();
      // La dirección se puede dejar escrita: con recogida se descarta.
      await page.getByLabel('Dirección', { exact: true }).fill('Calle que no se guarda 9');
      await page.waitForTimeout(3_200);
      await page.getByRole('button', { name: 'Confirmar pedido' }).click();

      await expect(page).toHaveURL(/\/pago-simulado\/fake_/);
      await page.getByRole('button', { name: 'Pagar' }).click();
      await expect(page).toHaveURL(/\/pedido\/confirmado\?ref=/);
      const heading = page.getByRole('heading', { level: 1, name: /^Pedido PC-\d+ confirmado$/ });
      await expect(heading).toBeVisible();

      const address = await clinicAddress();
      await expect(page.getByRole('heading', { name: 'Recogida' })).toBeVisible();
      await expect(page.locator('#contenido').getByText(address, { exact: true })).toBeVisible();
      const hours = page.getByRole('list', { name: 'Horario de la clínica' });
      await expect(hours.getByRole('listitem').first()).toBeVisible();
      await axeCheck(page);

      const [order] = await query<{ shipping_kind: string; address_line: string | null; postal_code: string | null; city: string | null }>(
        'SELECT shipping_kind, address_line, postal_code, city FROM orders',
      );
      expect(order).toEqual({ shipping_kind: 'clinic_pickup', address_line: null, postal_code: null, city: null });

      const number = (await heading.textContent())!.match(/PC-\d+/)![0];
      const email = await emailWithSubject(new RegExp(`^Pedido ${number} confirmado$`));
      const text = email.body.textContent ?? '';
      expect(text).toContain(address);
      expect(text).toContain('Horario');
      expect(text).not.toContain('Calle que no se guarda');
    });
  });
});
