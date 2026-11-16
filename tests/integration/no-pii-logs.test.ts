import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmOrder } from '@/lib/checkout/confirm';
import { logger } from '@/lib/logger';
import { runOrdersCli } from '@/lib/orders/cli';
import { cancelOrder } from '@/lib/orders/cancel';
import { expireOrders, runOrdersMaintenance } from '@/lib/orders/maintain';
import { emitFakeEvent, fakeCompletedEvent } from '@/lib/payments/fake';
import { checkoutForm, guestCart, guestCtx, orderRow, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// FR-032 (D19): los logs del flujo de pedido (checkout, aviso de la pasarela, mantenimiento, CLI y
// reembolso) llevan ids y códigos, nunca el correo, el nombre ni la dirección del comprador.

const PII = {
  email: 'ana.secreta@example.test',
  first_name: 'Anastasia',
  last_name: 'Zumalacárregui',
  address_line: 'Calle del Secreto 77',
  postal_code: '28777',
  city: 'Villasecreta',
};

describe('logs del flujo de pedido sin datos personales', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedShop();
  });
  afterAll(async () => {
    await teardownTestDb();
    vi.restoreAllMocks();
  });

  it('checkout, pago, CLI, reembolso, cancelación y caducidad', async () => {
    const spies = (['info', 'warn', 'error'] as const).map((level) => vi.spyOn(logger, level));
    const now = new Date();

    // Pedido pagado → CLI (set-status y cancel con reembolso).
    const a = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const paid = await confirmOrder(checkoutForm(PII), guestCtx(a.token, now));
    expect(paid.status).toBe('ok');
    if (paid.status !== 'ok') return;
    const [pay] = await q<{ provider_session_id: string; amount_cents: number }>('SELECT provider_session_id, amount_cents FROM payments WHERE order_id = $1', [paid.orderId]);
    await emitFakeEvent(fakeCompletedEvent(pay!.provider_session_id, pay!.amount_cents, paid.orderId));
    const { number } = await orderRow(paid.orderId);
    const out: string[] = [];
    await runOrdersCli(['set-status', number, 'preparing'], (l) => out.push(l), now);
    await runOrdersCli(['cancel', number, '--note', 'rotura'], (l) => out.push(l), now);

    // Pedido pendiente cancelado por el cliente; otro caducado; mantenimiento completo.
    const b = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const pending = await confirmOrder(checkoutForm({ ...PII, email: 'b.' + PII.email }), guestCtx(b.token, now));
    if (pending.status === 'ok') await cancelOrder(pending.orderId, 'customer', { reason: 'customer', now });
    const c = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    await confirmOrder(checkoutForm({ ...PII, email: 'c.' + PII.email }), guestCtx(c.token, now));
    await expireOrders(new Date(now.getTime() + 60 * 60_000));
    await runOrdersMaintenance(new Date(now.getTime() + 61 * 60_000));

    // Un checkout no válido tampoco escribe lo que se tecleó.
    const d = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    await confirmOrder(checkoutForm({ ...PII, postal_code: '99' }), guestCtx(d.token, now));

    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).toContain(paid.orderId);
    for (const value of Object.values(PII)) expect(logged).not.toContain(value);
    // La salida de la CLI es para el operador: ahí sí puede verse el pedido, pero no va a los logs.
    expect(out.join('\n')).toContain(number);
  });
});
