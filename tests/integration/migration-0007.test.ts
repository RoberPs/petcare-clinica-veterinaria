import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/db/client';
import { seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Migración 0007_admin_store (data-model.md): el backfill deja un movimiento "initial" por
// producto con su stock, y la bandeja de salida admite el correo order_status.

const MIGRATION = readFileSync('drizzle/0007_admin_store.sql', 'utf8');
/** La sentencia del backfill, tal como está en la migración. */
const BACKFILL = MIGRATION.split('--> statement-breakpoint')
  .map((s) => s.trim())
  .find((s) => s.includes('INSERT INTO "stock_movements"'))!;

describe('migración 0007_admin_store', () => {
  beforeAll(async () => {
    await setupTestDb();
    await truncateAll();
    await seedShop();
  });
  afterAll(teardownTestDb);

  it('el backfill crea un movimiento initial por producto con su stock', async () => {
    expect(BACKFILL).toBeDefined();
    await q('DELETE FROM stock_movements');
    await q("UPDATE products SET stock = 7 WHERE slug = 'pienso-perro-adulto'");
    await getPool().query(BACKFILL);
    const products = (await q<{ n: number }>('SELECT count(*)::int AS n FROM products'))[0]!.n;
    const rows = await q<{ slug: string; stock: number; delta: number; stock_after: number; reason: string; note: string }>(
      `SELECT p.slug, p.stock, m.delta, m.stock_after, m.reason, m.note
         FROM stock_movements m JOIN products p ON p.id = m.product_id`,
    );
    expect(products).toBeGreaterThan(0);
    expect(rows).toHaveLength(products);
    for (const r of rows) {
      expect(r).toMatchObject({ reason: 'initial', delta: 0, stock_after: r.stock, note: 'Saldo al activar el panel' });
    }
    expect(rows.find((r) => r.slug === 'pienso-perro-adulto')!.stock_after).toBe(7);
  });

  it('outbox_kind admite order_status', async () => {
    const [row] = await q<{ kind: string }>(`SELECT 'order_status'::outbox_kind::text AS kind`);
    expect(row!.kind).toBe('order_status');
  });

  it('los movimientos no admiten delta 0 salvo en initial ni stock negativo', async () => {
    const [p] = await q<{ id: string }>('SELECT id FROM products LIMIT 1');
    await expect(
      q(`INSERT INTO stock_movements (product_id, delta, reason, stock_after) VALUES ($1, 0, 'restock', 1)`, [p!.id]),
    ).rejects.toThrow(/stock_movements_delta/);
    await expect(
      q(`INSERT INTO stock_movements (product_id, delta, reason, stock_after) VALUES ($1, -1, 'damage', -1)`, [p!.id]),
    ).rejects.toThrow(/stock_movements_stock_after/);
  });
});
