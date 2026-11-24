import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { stockAdjustSchema } from '@/domain/store-schemas';
import { reserveStock, StockUnavailableError } from '@/lib/checkout/reserve';
import { adjustStock } from '@/lib/admin/stock';
import { adminCtx, productBySlug, seedShop, setStock } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Ajuste manual del stock (US4, G5): suma y resta con movimiento y autor, aviso de stock
// insuficiente con el máximo, y concurrencia con las reservas sin bajar nunca de 0.

const SLUG = 'pienso-perro-adulto';
let admin: { id: string };
let productId: string;

const input = (delta: number, reason = 'restock', note?: string) => stockAdjustSchema.parse({ id: productId, delta: String(delta), reason, note });

describe('ajuste de stock', () => {
  beforeAll(setupTestDb);
  beforeEach(async () => {
    await truncateAll();
    await seedShop();
    admin = await adminCtx();
    productId = (await productBySlug(SLUG)).id;
    await setStock(SLUG, 5);
    await q('DELETE FROM stock_movements');
  });
  afterAll(teardownTestDb);

  it('suma y resta con su movimiento, autor y registro de la acción', async () => {
    expect(await adjustStock(admin, input(10), new Date())).toMatchObject({ status: 'ok', stock: 15 });
    expect(await adjustStock(admin, input(-3, 'damage', 'Caja rota'), new Date())).toMatchObject({ status: 'ok', stock: 12 });
    expect((await productBySlug(SLUG)).stock).toBe(12);
    const moves = await q('SELECT delta, reason, stock_after, admin_id, note FROM stock_movements WHERE product_id = $1 ORDER BY created_at, id', [productId]);
    expect(moves).toEqual([
      { delta: 10, reason: 'restock', stock_after: 15, admin_id: admin.id, note: null },
      { delta: -3, reason: 'damage', stock_after: 12, admin_id: admin.id, note: 'Caja rota' },
    ]);
    const audit = await q<{ action: string; changes: Record<string, unknown> }>("SELECT action, changes FROM admin_audit_log WHERE entity_id = $1 ORDER BY at", [productId]);
    expect(audit.map((a) => a.action)).toEqual(['stock.adjust', 'stock.adjust']);
    expect(audit[1]!.changes).toEqual({ delta: -3, reason: 'damage', stockAfter: 12 });
  });

  it('restar más de lo disponible devuelve el máximo y no cambia nada', async () => {
    expect(await adjustStock(admin, input(-6), new Date())).toEqual({ status: 'insufficient', max: 5 });
    expect((await productBySlug(SLUG)).stock).toBe(5);
    expect(await q('SELECT count(*)::int AS n FROM stock_movements')).toEqual([{ n: 0 }]);
    expect(await adjustStock(admin, input(-5), new Date())).toMatchObject({ status: 'ok', stock: 0 });
    expect(await adjustStock(admin, { ...input(1), id: crypto.randomUUID() }, new Date())).toEqual({ status: 'not_found' });
  });

  it('ajustes y reservas simultáneos nunca dejan el stock negativo y los movimientos cuadran', async () => {
    await setStock(SLUG, 10);
    const start = 10;
    const tasks: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) tasks.push(adjustStock(admin, input(i % 4 === 0 ? -3 : 2, i % 4 === 0 ? 'damage' : 'restock'), new Date()));
      else
        tasks.push(
          getDb()
            .transaction((tx) => reserveStock(tx, [{ productId, quantity: 2 }]))
            .catch((e) => {
              if (!(e instanceof StockUnavailableError)) throw e;
            }),
        );
    }
    await Promise.all(tasks);
    const stock = (await productBySlug(SLUG)).stock;
    expect(stock).toBeGreaterThanOrEqual(0);
    const [{ sum, negatives }] = (await q<{ sum: number; negatives: number }>(
      'SELECT coalesce(sum(delta), 0)::int AS sum, count(*) FILTER (WHERE stock_after < 0)::int AS negatives FROM stock_movements WHERE product_id = $1',
      [productId],
    )) as [{ sum: number; negatives: number }];
    expect(negatives).toBe(0);
    expect(start + sum).toBe(stock);
  });
});
