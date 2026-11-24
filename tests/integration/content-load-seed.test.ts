import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { loadContentFile } from '@/content/load';
import { createAppointment, createBlock, madrid, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// content:load siembra y no sobrescribe la agenda del panel (F4, FR-018, SC-006); --force-booking
// lo restaura todo sin borrar servicios ni miembros.

function variant(mutate: (c: Record<string, any>) => void): string {
  const c = parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>;
  mutate(c);
  const file = join(mkdtempSync(join(tmpdir(), 'petcare-seed-')), 'variant.yaml');
  writeFileSync(file, stringify(c));
  return file;
}

const PANEL_EDITS = `
  UPDATE booking_services SET name = 'Consulta del panel', duration_minutes = 40 WHERE slug = 'consulta-general';
  UPDATE team_members SET name = 'Nombre del panel', bookable = false WHERE slug = 'nerea-olmedo';
  DELETE FROM staff_hours WHERE team_member_id = (SELECT id FROM team_members WHERE slug = 'inigo-barral');
  INSERT INTO staff_hours (team_member_id, weekday, opens_at, closes_at)
    SELECT id, 2, '10:00', '12:00' FROM team_members WHERE slug = 'inigo-barral';
`;

describe('content:load y la agenda del panel', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await loadContentFile(await setupTestDb(), 'content/petcare.yaml');
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('la primera carga siembra servicios, reservables y su horario copiado del de la clínica', async () => {
    const hours = (await q<{ n: number }>('SELECT count(*)::int AS n FROM opening_hours'))[0]!.n;
    const bookable = await q('SELECT id FROM team_members WHERE bookable');
    expect(bookable.length).toBeGreaterThan(0);
    for (const m of bookable) {
      expect(await q('SELECT count(*)::int AS n FROM staff_hours WHERE team_member_id = $1', [m.id])).toEqual([{ n: hours }]);
    }
  });

  it('sin --force-booking no sobrescribe lo del panel, crea lo nuevo y actualiza la ficha pública', async () => {
    await q(PANEL_EDITS);
    await loadContentFile(
      await setupTestDb(),
      variant((c) => {
        c.booking.services.push({ slug: 'acupuntura', name: 'Acupuntura', duration_minutes: 30, staff: ['inigo-barral'] });
        c.team.find((m: any) => m.slug === 'nerea-olmedo').specialty = 'Especialidad nueva';
      }),
    );
    expect(await q("SELECT name, duration_minutes FROM booking_services WHERE slug = 'consulta-general'")).toEqual([
      { name: 'Consulta del panel', duration_minutes: 40 },
    ]);
    expect(await q("SELECT name, bookable, specialty FROM team_members WHERE slug = 'nerea-olmedo'")).toEqual([
      { name: 'Nombre del panel', bookable: false, specialty: 'Especialidad nueva' },
    ]);
    expect(
      await q("SELECT weekday, opens_at, closes_at FROM staff_hours WHERE team_member_id = (SELECT id FROM team_members WHERE slug = 'inigo-barral')"),
    ).toEqual([{ weekday: 2, opens_at: '10:00:00', closes_at: '12:00:00' }]);
    expect(await q("SELECT name, published FROM booking_services WHERE slug = 'acupuntura'")).toEqual([{ name: 'Acupuntura', published: true }]);
    // Un servicio que falta en el YAML tampoco se despublica.
    await loadContentFile(await setupTestDb(), variant((c) => (c.booking.services = c.booking.services.filter((s: any) => s.slug !== 'dermatologia'))));
    expect(await q("SELECT published FROM booking_services WHERE slug = 'dermatologia'")).toEqual([{ published: true }]);
  });

  it('con --force-booking restaura todo aunque haya citas, y lo que falta queda despublicado, no borrado', async () => {
    await q(PANEL_EDITS);
    await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid('2026-11-02', '10:00') });
    const future = await createAppointment({ service: 'dermatologia', startsAt: madrid('2027-01-12', '10:00') });
    await createBlock({ kind: 'once', startsAt: madrid('2027-01-13', '10:00'), endsAt: madrid('2027-01-13', '11:00') });
    await loadContentFile(
      await setupTestDb(),
      variant((c) => (c.booking.services = c.booking.services.filter((s: any) => s.slug !== 'dermatologia'))),
      { forceBooking: true },
    );
    const yaml = parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>;
    const consulta = yaml.booking.services.find((s: any) => s.slug === 'consulta-general');
    expect(await q("SELECT name, duration_minutes FROM booking_services WHERE slug = 'consulta-general'")).toEqual([
      { name: consulta.name, duration_minutes: consulta.duration_minutes },
    ]);
    const nerea = yaml.team.find((m: any) => m.slug === 'nerea-olmedo');
    expect(await q("SELECT name, bookable FROM team_members WHERE slug = 'nerea-olmedo'")).toEqual([{ name: nerea.name, bookable: true }]);
    const hours = (await q<{ n: number }>('SELECT count(*)::int AS n FROM opening_hours'))[0]!.n;
    expect(
      await q("SELECT count(*)::int AS n FROM staff_hours WHERE team_member_id = (SELECT id FROM team_members WHERE slug = 'inigo-barral')"),
    ).toEqual([{ n: hours }]);
    expect(await q('SELECT count(*)::int AS n FROM schedule_blocks')).toEqual([{ n: 0 }]);
    expect(await q("SELECT published FROM booking_services WHERE slug = 'dermatologia'")).toEqual([{ published: false }]);
    expect(await q('SELECT status FROM appointments WHERE id = $1', [future.id])).toEqual([{ status: 'confirmed' }]);
  });
});

// Feature 008 (G13): la tienda del panel sobrevive a una recarga sin --force-shop; con él, se
// restaura desde el archivo con movimientos "content_load".
describe('content:load y la tienda del panel', () => {
  const PANEL_PRODUCT_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await loadContentFile(await setupTestDb(), 'content/petcare.yaml');
    // Producto creado en el panel, stock ajustado, precio cambiado y código propio del panel.
    await q(
      `INSERT INTO products (id, slug, name, search_name, short_description, description_md, category_id, price_cents, vat_rate, stock)
       SELECT $1, 'producto-del-panel', 'Producto del panel', 'producto del panel', 'Descripción corta.', 'Descripción larga del producto.',
         id, 1000, 21, 4 FROM product_categories ORDER BY position LIMIT 1`,
      [PANEL_PRODUCT_ID],
    );
    await q("UPDATE products SET stock = 77, price_cents = 1234 WHERE slug = 'pienso-perro-adulto'");
    await q("INSERT INTO discount_codes (code, kind, value) VALUES ('DELPANEL', 'percent', 5)");
    await q("UPDATE discount_codes SET value = 50 WHERE code = 'BIENVENIDA10'");
    await q('DELETE FROM stock_movements');
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('la primera carga crea cada producto con su movimiento initial', async () => {
    await truncateAll();
    const summary = await loadContentFile(await setupTestDb(), 'content/petcare.yaml');
    const [{ products }] = (await q<{ products: number }>('SELECT count(*)::int AS products FROM products')) as [{ products: number }];
    expect(summary.shopCounts.productsCreated).toBe(products);
    expect(await q("SELECT count(*)::int AS n FROM stock_movements WHERE reason = 'initial'")).toEqual([{ n: products }]);
  });

  it('sin --force-shop conserva lo del panel y no despublica ni desactiva lo ausente', async () => {
    const summary = await loadContentFile(await setupTestDb(), 'content/petcare.yaml');
    expect(summary.shopCounts).toMatchObject({ productsCreated: 0, productsRestored: 0, discountsCreated: 0, discountsRestored: 0 });
    expect(summary.shopCounts.productsKept).toBeGreaterThan(0);
    expect(await q("SELECT stock, price_cents FROM products WHERE slug = 'pienso-perro-adulto'")).toEqual([{ stock: 77, price_cents: 1234 }]);
    expect(await q("SELECT published FROM products WHERE slug = 'producto-del-panel'")).toEqual([{ published: true }]);
    expect(await q("SELECT enabled FROM discount_codes WHERE code = 'DELPANEL'")).toEqual([{ enabled: true }]);
    expect(await q("SELECT value FROM discount_codes WHERE code = 'BIENVENIDA10'")).toEqual([{ value: 50 }]);
    expect(await q('SELECT count(*)::int AS n FROM stock_movements')).toEqual([{ n: 0 }]);
  });

  it('sin --force-shop crea los productos y códigos nuevos del archivo', async () => {
    const file = variant((c) => {
      const base = c.shop.products[0];
      c.shop.products.push({ ...base, slug: 'producto-nuevo-yaml', name: 'Producto nuevo del archivo', stock: 9 });
      c.checkout.discount_codes.push({ code: 'NUEVOYAML', kind: 'percent', value: 15 });
    });
    const summary = await loadContentFile(await setupTestDb(), file);
    expect(summary.shopCounts).toMatchObject({ productsCreated: 1, discountsCreated: 1 });
    expect(await q("SELECT m.delta, m.reason, m.stock_after FROM stock_movements m JOIN products p ON p.id = m.product_id WHERE p.slug = 'producto-nuevo-yaml'")).toEqual([
      { delta: 9, reason: 'initial', stock_after: 9 },
    ]);
    expect(await q("SELECT enabled FROM discount_codes WHERE code = 'NUEVOYAML'")).toEqual([{ enabled: true }]);
  });

  it('con --force-shop restaura todo, despublica el ausente y deja el movimiento content_load', async () => {
    const yamlStock = (parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>).shop.products.find(
      (p: Record<string, any>) => p.slug === 'pienso-perro-adulto',
    ).stock as number;
    const summary = await loadContentFile(await setupTestDb(), 'content/petcare.yaml', { forceShop: true });
    expect(summary.shopCounts.productsRestored).toBeGreaterThan(0);
    expect(summary.shopCounts.discountsRestored).toBeGreaterThan(0);
    const [p] = await q<{ stock: number; price_cents: number }>("SELECT stock, price_cents FROM products WHERE slug = 'pienso-perro-adulto'");
    expect(p!.stock).toBe(yamlStock);
    expect(p!.price_cents).not.toBe(1234);
    expect(await q("SELECT published FROM products WHERE slug = 'producto-del-panel'")).toEqual([{ published: false }]);
    expect(
      await q("SELECT m.delta, m.reason, m.stock_after FROM stock_movements m JOIN products p ON p.id = m.product_id WHERE p.slug = 'pienso-perro-adulto'"),
    ).toEqual([{ delta: yamlStock - 77, reason: 'content_load', stock_after: yamlStock }]);
    // Solo deja movimiento el stock que cambia.
    expect(await q("SELECT count(*)::int AS n FROM stock_movements")).toEqual([{ n: 1 }]);
    expect(await q("SELECT enabled FROM discount_codes WHERE code = 'DELPANEL'")).toEqual([{ enabled: false }]);
    expect(await q("SELECT value FROM discount_codes WHERE code = 'BIENVENIDA10'")).toEqual([{ value: 10 }]);
  });
});

