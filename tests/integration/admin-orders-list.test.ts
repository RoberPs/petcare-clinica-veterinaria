import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_ORDERS_PAGE_SIZE, countOrdersByStatus, getOrderAdmin, listOrdersAdmin } from '@/db/queries/admin-orders';
import { ordersBackPath } from '@/domain/store-schemas';
import { orderInStatus, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Lista de pedidos del panel (US2, G6): orden, paginación, filtros, recuentos, búsqueda por número,
// pedidos anonimizados y el enlace "Volver".

const ids: Record<string, string> = {};

describe('lista de pedidos del panel', () => {
  beforeAll(async () => {
    await setupTestDb();
    await truncateAll();
    await seedShop((content) => {
      // Stock de sobra para los 30 pedidos.
      for (const p of content.shop.products) p.stock = 500;
    });
    const t0 = Date.now() - 60 * 60_000;
    const statuses = ['pending_payment', 'paid', 'preparing', 'shipped', 'ready_for_pickup', 'delivered', 'cancelled'] as const;
    for (const [i, s] of statuses.entries()) {
      const pickup = s === 'ready_for_pickup';
      ids[s] = (await orderInStatus(s, { delivery: pickup ? 'pickup' : 'home', now: new Date(t0 + i * 60_000) })).orderId;
    }
    // Más pedidos pagados para la paginación (25 por página).
    for (let i = 0; i < 23; i++) await orderInStatus('paid', { now: new Date(t0 + (10 + i) * 60_000) });
    // Uno anonimizado (cuenta eliminada).
    await q(
      `UPDATE orders SET anonymized_at = now(), contact_email = NULL, contact_email_normalized = NULL, first_name = NULL,
         last_name = NULL, address_line = NULL, postal_code = NULL, city = NULL WHERE id = $1`,
      [ids.delivered],
    );
  });
  afterAll(teardownTestDb);

  it('ordena por fecha descendente y pagina de 25 en 25', async () => {
    const p1 = await listOrdersAdmin({ page: 1 });
    const p2 = await listOrdersAdmin({ page: 2 });
    expect(p1.total).toBe(30);
    expect(p1.rows).toHaveLength(ADMIN_ORDERS_PAGE_SIZE);
    expect(p2.rows).toHaveLength(5);
    const all = [...p1.rows, ...p2.rows].map((r) => r.createdAt.getTime());
    expect(all).toEqual([...all].sort((a, b) => b - a));
    expect(p2.rows.at(-1)!.id).toBe(ids.pending_payment);
  });

  it('filtra por cada estado y cuenta los pedidos de cada uno', async () => {
    const counts = await countOrdersByStatus();
    expect(counts).toMatchObject({ all: 30, pending_payment: 1, paid: 24, preparing: 1, shipped: 1, ready_for_pickup: 1, delivered: 1, cancelled: 1 });
    for (const s of ['pending_payment', 'preparing', 'shipped', 'ready_for_pickup', 'delivered', 'cancelled'] as const) {
      const r = await listOrdersAdmin({ status: s });
      expect(r.total, s).toBe(1);
      expect(r.rows[0]!.id, s).toBe(ids[s]);
    }
    expect((await listOrdersAdmin({ status: 'paid' })).total).toBe(24);
  });

  it('busca por prefijo del número sin distinguir mayúsculas ni espacios', async () => {
    const [row] = await q<{ number: string }>('SELECT number FROM orders WHERE id = $1', [ids.shipped]);
    const number = row!.number;
    const r = await listOrdersAdmin({ number: ` ${number.toLowerCase().slice(0, 3)} ${number.slice(3)} ` });
    expect(r.rows.map((x) => x.id)).toEqual([ids.shipped]);
    const prefix = await listOrdersAdmin({ number: number.slice(0, -1).toLowerCase() });
    expect(prefix.rows.map((x) => x.id)).toContain(ids.shipped);
    expect((await listOrdersAdmin({ number: 'NO-EXISTE' })).total).toBe(0);
    expect((await listOrdersAdmin({ number: '%' })).total).toBe(0);
  });

  it('un pedido anonimizado se lista sin datos de contacto', async () => {
    const r = await listOrdersAdmin({ status: 'delivered' });
    expect(r.rows[0]!.customerName).toBeNull();
    const paid = await listOrdersAdmin({ status: 'shipped' });
    expect(paid.rows[0]!.customerName).toBe('Ana Pruebas');
  });

  it('el detalle trae líneas, totales, pago e historial', async () => {
    const d = (await getOrderAdmin(ids.shipped!))!;
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.order.totalCents).toBe(d.order.subtotalCents - d.order.discountCents + d.order.shippingCostCents);
    expect(d.payment?.provider).toBe('fake');
    expect(d.history.map((h) => h.toStatus)).toEqual(['pending_payment', 'paid', 'preparing', 'shipped']);
    expect(await getOrderAdmin(crypto.randomUUID())).toBeNull();
  });

  it('«Volver» solo acepta la lista del panel', () => {
    expect(ordersBackPath('/admin/pedidos?estado=paid&pagina=2')).toBe('/admin/pedidos?estado=paid&pagina=2');
    expect(ordersBackPath('/admin/pedidos')).toBe('/admin/pedidos');
    expect(ordersBackPath('https://malo.example/admin/pedidos?x')).toBe('/admin/pedidos');
    expect(ordersBackPath('//malo.example')).toBe('/admin/pedidos');
    expect(ordersBackPath('/admin/pedidosx')).toBe('/admin/pedidos');
    expect(ordersBackPath('/admin/pedidos?estado=paid&next=//malo')).toBe('/admin/pedidos?estado=paid');
    expect(ordersBackPath('/admin/pedidos?estado=<script>')).toBe('/admin/pedidos');
    expect(ordersBackPath(undefined)).toBe('/admin/pedidos');
  });
});
