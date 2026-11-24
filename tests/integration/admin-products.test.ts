import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogRouteExists } from '@/db/queries/catalog';
import { productSchema } from '@/domain/store-schemas';
import { saveProduct, setProductPublished } from '@/lib/admin/products';
import { adminCtx, cardOrder, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { useTempUploadsDir } from './helpers/uploads';

// Productos desde el panel (US1, G2 y G3): alta con movimiento inicial y auditoría, slug fijo,
// nombre único, precio que no toca los pedidos y desactivar o reactivar.

let uploads: Awaited<ReturnType<typeof useTempUploadsDir>>;
let admin: { id: string };
let base: Record<string, unknown>;

const input = (over: Record<string, unknown> = {}) => productSchema.parse({ ...base, ...over });

describe('productos del panel', () => {
  beforeAll(async () => {
    await setupTestDb();
    uploads = await useTempUploadsDir();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedShop();
    admin = await adminCtx();
    const [cat] = await q<{ id: string }>("SELECT id FROM product_categories ORDER BY position LIMIT 1");
    const pets = await q<{ id: string }>('SELECT id FROM product_pets ORDER BY position LIMIT 2');
    base = {
      name: 'Arnés Reflectante',
      short_description: 'Arnés cómodo con bandas reflectantes.',
      description_md: 'Arnés ajustable con bandas reflectantes para paseos nocturnos.',
      category_id: cat!.id,
      pet_ids: pets.map((p) => p.id),
      price: '24,90',
      vat_rate: '21',
      stock_initial: '8',
      position: '5',
      published: 'on',
      is_new: 'on',
    };
  });
  afterAll(async () => {
    await uploads.cleanup();
    await teardownTestDb();
  });

  it('el alta crea el producto con su movimiento initial y deja registro de auditoría', async () => {
    const now = new Date();
    const r = await saveProduct(admin, input(), { now, submissionId: crypto.randomUUID() });
    expect(r).toMatchObject({ status: 'ok', slug: 'arnes-reflectante', created: true });
    const id = (r as { id: string }).id;
    const [p] = await q('SELECT stock, price_cents, search_name, is_new, published, compare_at_cents FROM products WHERE id = $1', [id]);
    expect(p).toMatchObject({ stock: 8, price_cents: 2490, search_name: 'arnes reflectante', is_new: true, published: true, compare_at_cents: null });
    expect(await q('SELECT count(*)::int AS n FROM product_pet_links WHERE product_id = $1', [id])).toEqual([{ n: 2 }]);
    const moves = await q('SELECT delta, reason, stock_after, admin_id FROM stock_movements WHERE product_id = $1', [id]);
    expect(moves).toEqual([{ delta: 8, reason: 'initial', stock_after: 8, admin_id: admin.id }]);
    const audit = await q<{ action: string; actor_id: string; changes: Record<string, unknown> }>(
      "SELECT action, actor_id, changes FROM admin_audit_log WHERE entity_type = 'product' AND entity_id = $1",
      [id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'product.create', actor_id: admin.id });
    expect(audit[0]!.changes).toMatchObject({ name: 'Arnés Reflectante', slug: 'arnes-reflectante', priceCents: 2490 });
    expect(JSON.stringify(audit[0]!.changes)).not.toContain('reflectantes para paseos');
  });

  it('el alta con el mismo token es idempotente', async () => {
    const submissionId = crypto.randomUUID();
    const now = new Date();
    await saveProduct(admin, input(), { now, submissionId });
    const again = await saveProduct(admin, input(), { now, submissionId });
    expect(again).toMatchObject({ status: 'ok', created: false });
    expect(await q("SELECT count(*)::int AS n FROM products WHERE name = 'Arnés Reflectante'")).toEqual([{ n: 1 }]);
  });

  it('el slug es único y no cambia al renombrar', async () => {
    const now = new Date();
    const a = await saveProduct(admin, input({ name: 'Pienso Perro Adulto Extra' }), { now });
    expect(a).toMatchObject({ status: 'ok', slug: 'pienso-perro-adulto-extra' });
    // Mismo slug base que un producto de la demo, con otro nombre.
    const b = await saveProduct(admin, input({ name: 'Pienso perro adulto!' }), { now });
    expect(b).toMatchObject({ status: 'ok', slug: 'pienso-perro-adulto-2' });
    const id = (a as { id: string }).id;
    const renamed = await saveProduct(admin, input({ id, name: 'Otro nombre distinto' }), { now });
    expect(renamed).toMatchObject({ status: 'ok', slug: 'pienso-perro-adulto-extra' });
  });

  it('un nombre repetido (sin distinguir mayúsculas) da error de campo', async () => {
    const [existing] = await q<{ name: string }>("SELECT name FROM products WHERE slug = 'pienso-perro-adulto'");
    const r = await saveProduct(admin, input({ name: existing!.name.toUpperCase() }), { now: new Date() });
    expect(r).toEqual({ status: 'invalid', fieldErrors: { name: 'Ya hay un producto con ese nombre.' } });
  });

  it('editar el precio no altera las líneas de los pedidos', async () => {
    const { orderId } = await cardOrder([{ slug: 'pienso-perro-adulto', quantity: 2 }]);
    const [before] = await q('SELECT unit_price_cents, line_total_cents FROM order_items WHERE order_id = $1', [orderId]);
    const [p] = await q<Record<string, any>>(
      `SELECT p.*, array(SELECT pet_id FROM product_pet_links WHERE product_id = p.id) AS pet_ids FROM products p WHERE slug = 'pienso-perro-adulto'`,
    );
    const r = await saveProduct(
      admin,
      input({
        id: p!.id,
        name: p!.name,
        short_description: p!.short_description,
        description_md: p!.description_md,
        category_id: p!.category_id,
        pet_ids: p!.pet_ids,
        price: '99,99',
        vat_rate: String(p!.vat_rate),
        image_alt: p!.image_alt,
        has_image: p!.image_path !== null,
      }),
      { now: new Date() },
    );
    expect(r.status).toBe('ok');
    expect((await q('SELECT price_cents FROM products WHERE id = $1', [p!.id]))[0]).toEqual({ price_cents: 9999 });
    expect((await q('SELECT unit_price_cents, line_total_cents FROM order_items WHERE order_id = $1', [orderId]))[0]).toEqual(before);
    const [audit] = await q<{ changes: Record<string, any> }>(
      "SELECT changes FROM admin_audit_log WHERE action = 'product.update' AND entity_id = $1",
      [p!.id],
    );
    expect(audit!.changes.priceCents).toEqual({ before: p!.price_cents, after: 9999 });
  });

  it('desactivar un producto con pedidos lo saca del catálogo sin tocar los pedidos; reactivar lo devuelve', async () => {
    const { orderId } = await cardOrder([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const [p] = await q<{ id: string }>("SELECT id FROM products WHERE slug = 'pienso-perro-adulto'");
    const now = new Date();
    expect(await catalogRouteExists('pienso-perro-adulto')).toBe(true);
    expect(await setProductPublished(admin, p!.id, false, now)).toMatchObject({ status: 'ok', changed: true });
    expect(await catalogRouteExists('pienso-perro-adulto')).toBe(false);
    const [item] = await q('SELECT product_id, product_name FROM order_items WHERE order_id = $1', [orderId]);
    expect(item).toMatchObject({ product_id: p!.id });
    expect((await q('SELECT status FROM orders WHERE id = $1', [orderId]))[0]).toEqual({ status: 'pending_payment' });
    expect(await setProductPublished(admin, p!.id, false, now)).toMatchObject({ status: 'ok', changed: false });
    expect(await setProductPublished(admin, p!.id, true, now)).toMatchObject({ status: 'ok', changed: true });
    expect(await catalogRouteExists('pienso-perro-adulto')).toBe(true);
    const actions = (await q<{ action: string }>("SELECT action FROM admin_audit_log WHERE entity_id = $1 ORDER BY at", [p!.id])).map((r) => r.action);
    expect(actions).toEqual(['product.unpublish', 'product.publish']);
  });

  it('un id que no existe da not_found', async () => {
    expect(await saveProduct(admin, input({ id: crypto.randomUUID() }), { now: new Date() })).toEqual({ status: 'not_found' });
    expect(await setProductPublished(admin, crypto.randomUUID(), false, new Date())).toEqual({ status: 'not_found' });
  });
});
