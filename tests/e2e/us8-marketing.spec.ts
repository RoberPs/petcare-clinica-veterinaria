import { createCustomer, query, resetAccountState } from './db';
import { axeCheck, dismissCookies, expect, loginAs, test } from './fixtures';

// US8 · preferencia de consejos y novedades.

test.describe('US8 · consejos y novedades', () => {
  test.beforeEach(async () => {
    await resetAccountState();
  });

  test('en el registro la casilla está desmarcada y separada de la de privacidad', async ({ page }) => {
    await page.goto('/crear-cuenta');
    await dismissCookies(page);
    const marketing = page.getByRole('checkbox', { name: /consejos de salud/ });
    await expect(marketing).not.toBeChecked();
    await expect(page.getByRole('group', { name: 'Comunicaciones (opcional)' })).toContainText('consejos de salud');
    await expect(page.getByRole('group', { name: 'Comunicaciones (opcional)' })).not.toContainText('política de privacidad');
  });

  test('"Datos personales" refleja la preferencia y permite desactivarla', async ({ page }) => {
    const c = await createCustomer({ marketingOptIn: true });
    await loginAs(page, c);
    await page.goto('/mi-cuenta/datos');
    await dismissCookies(page);
    const box = page.getByRole('checkbox', { name: /consejos de salud/ });
    await expect(box).toBeChecked();
    await axeCheck(page);

    await box.uncheck();
    await page.getByRole('button', { name: 'Guardar la preferencia' }).click();
    await expect(page).toHaveURL(/aviso=datos-guardados$/);
    await expect(page.getByRole('checkbox', { name: /consejos de salud/ })).not.toBeChecked();
    expect(await query('SELECT marketing_opt_in FROM customers WHERE id = $1', [c.id])).toEqual([{ marketing_opt_in: false }]);
    expect(await query("SELECT kind::text FROM customer_consents WHERE customer_id = $1 AND kind = 'marketing_opt_out'", [c.id])).toHaveLength(1);
  });
});
