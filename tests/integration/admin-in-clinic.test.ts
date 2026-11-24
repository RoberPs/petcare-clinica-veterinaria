import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cancelOrderAdmin, confirmInClinicPayment } from '@/lib/admin/orders';
import { runOrdersMaintenance } from '@/lib/orders/maintain';
import { adminCtx, inClinicOrder, orderRow, outboxKinds, productBySlug, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Pago en la clínica (US5, G7): confirmar el pago (reserva confirmada, ya no caduca, un correo) o
// el pago y la entrega a la vez (dos filas en el historial y un solo correo combinado).

let admin: { id: string };

const history = (orderId: string) =>
  q<{ to_status: string; actor: string; admin_id: string | null }>(
    'SELECT to_status, actor, admin_id FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id',
    [orderId],
  );

async function freshOrder(now = new Date()) {
  const { orderId } = await inClinicOrder([{ slug: 'pienso-perro-adulto', quantity: 1 }], { now });
  await q('DELETE FROM email_outbox WHERE order_id = $1', [orderId]);
  return orderId;
}

describe('pago en la clínica desde el panel', () => {
  beforeAll(setupTestDb);
  beforeEach(async () => {
    await truncateAll();
    await seedShop();
    admin = await adminCtx();
  });
  afterAll(teardownTestDb);

  it('confirmar el pago: Pagado, reserva confirmada, un correo y ya no caduca', async () => {
    const stock = (await productBySlug('pienso-perro-adulto')).stock;
    const orderId = await freshOrder();
    expect(await confirmInClinicPayment(admin, { id: orderId, from: 'pending_payment', deliver: false }, new Date())).toEqual({ status: 'ok' });
    const row = await orderRow(orderId);
    expect(row).toMatchObject({ status: 'paid', reservation_status: 'committed' });
    expect(row.paid_at).not.toBeNull();
    expect(await outboxKinds(orderId)).toEqual(['order_status']);
    const [mail] = await q<{ payload: { subject: string } }>('SELECT payload FROM email_outbox WHERE order_id = $1', [orderId]);
    expect(mail!.payload.subject).toContain('pago registrado');
    expect((await history(orderId)).at(-1)).toEqual({ to_status: 'paid', actor: 'clinic', admin_id: admin.id });

    // Pasado el plazo de recogida, el mantenimiento ya no lo cancela.
    await runOrdersMaintenance(new Date(row.pickup_deadline.getTime() + 60 * 60_000));
    expect((await orderRow(orderId)).status).toBe('paid');
    expect((await productBySlug('pienso-perro-adulto')).stock).toBe(stock - 1);
  });

  it('confirmar pago y entrega: dos filas en el historial y un solo correo combinado', async () => {
    const orderId = await freshOrder();
    expect(await confirmInClinicPayment(admin, { id: orderId, from: 'pending_payment', deliver: true }, new Date())).toEqual({ status: 'ok' });
    expect((await orderRow(orderId)).status).toBe('delivered');
    expect((await history(orderId)).slice(-2)).toEqual([
      { to_status: 'paid', actor: 'clinic', admin_id: admin.id },
      { to_status: 'delivered', actor: 'clinic', admin_id: admin.id },
    ]);
    expect(await outboxKinds(orderId)).toEqual(['order_status']);
    const [mail] = await q<{ payload: { subject: string; text: string } }>('SELECT payload FROM email_outbox WHERE order_id = $1', [orderId]);
    expect(mail!.payload.subject).toContain('pagado y entregado');
    expect(mail!.payload.text).toContain('Pago confirmado y pedido entregado');
  });

  it('cancelar un pedido pagado en la clínica avisa al comprador y no deja un reembolso pendiente', async () => {
    const orderId = await freshOrder();
    await confirmInClinicPayment(admin, { id: orderId, from: 'pending_payment', deliver: false }, new Date());
    await q('DELETE FROM email_outbox WHERE order_id = $1', [orderId]);
    expect(await cancelOrderAdmin(admin, { id: orderId, from: 'paid', note: 'Cliente no viene' }, new Date())).toEqual({ status: 'ok', refund: null });
    expect(await orderRow(orderId)).toMatchObject({ status: 'cancelled', refund_status: 'none', reservation_status: 'released' });
    expect(await outboxKinds(orderId)).toEqual(['order_cancelled']);
  });

  it('un pedido caducado o cancelado no se puede confirmar', async () => {
    const orderId = await freshOrder();
    const row = await orderRow(orderId);
    const late = new Date(row.pickup_deadline.getTime() + 1000);
    expect(await confirmInClinicPayment(admin, { id: orderId, from: 'pending_payment', deliver: false }, late)).toEqual({ status: 'not_allowed' });
    await runOrdersMaintenance(late);
    expect((await orderRow(orderId)).status).toBe('cancelled');
    expect(await confirmInClinicPayment(admin, { id: orderId, from: 'pending_payment', deliver: true }, new Date())).toEqual({ status: 'stale' });
    expect((await orderRow(orderId)).status).toBe('cancelled');
  });

  it('carrera entre la confirmación y la caducidad automática: solo gana una', async () => {
    for (let i = 0; i < 5; i++) {
      const orderId = await freshOrder();
      const deadline = (await orderRow(orderId)).pickup_deadline as Date;
      const [confirm] = await Promise.all([
        confirmInClinicPayment(admin, { id: orderId, from: 'pending_payment', deliver: false }, new Date(deadline.getTime() - 60_000)),
        runOrdersMaintenance(new Date(deadline.getTime() + 60_000)),
      ]);
      const final = (await orderRow(orderId)).status;
      const statuses = (await history(orderId)).map((h) => h.to_status);
      if (confirm.status === 'ok') {
        expect(final).toBe('paid');
        expect(statuses).toEqual(['pending_payment', 'paid']);
      } else {
        expect(confirm.status).toBe('stale');
        expect(final).toBe('cancelled');
        expect(statuses).toEqual(['pending_payment', 'cancelled']);
      }
    }
  });
});
