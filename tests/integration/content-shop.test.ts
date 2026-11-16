import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ContentValidationError } from '@/content/load';
import { product, productIds, seedCatalog } from './helpers/catalog';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Carga del bloque shop: (contracts/content-file.md, C12).

describe('carga del bloque shop:', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('la carga inicial crea los ajustes, las categorías, las mascotas y los productos', async () => {
    const summary = await seedCatalog();
    expect(summary).toMatchObject({ shopCategories: 5, shopPets: 3, products: 24, productsHidden: 0 });

    expect(await q('SELECT shipping_text, page_size, demo_notice_enabled FROM shop_settings')).toEqual([
      { shipping_text: '24-48 h', page_size: 12, demo_notice_enabled: true },
    ]);
    const cats = await q('SELECT slug FROM product_categories WHERE published ORDER BY position');
    expect(cats.map((c) => c.slug)).toEqual(['alimentacion', 'higiene', 'juguetes', 'accesorios', 'salud-bienestar']);

    const [pienso] = await q(
      `SELECT name, search_name, price_cents, compare_at_cents, vat_rate, stock, is_new, position, image_path, image_alt
       FROM products WHERE slug = 'pienso-perro-adulto'`,
    );
    expect(pienso).toMatchObject({
      search_name: 'pienso de pollo para perro adulto, 12 kg',
      price_cents: 4250,
      compare_at_cents: 4790,
      vat_rate: 10,
      stock: 14,
      is_new: true,
      position: 0,
      image_path: '/media/petcare/productos/pienso-perro-adulto.svg',
    });
    const [champu] = await q(`SELECT search_name FROM products WHERE slug = 'champu-piel-sensible'`);
    expect(champu!.search_name).toBe('champu para piel sensible 250 ml');

    const links = await q(
      `SELECT pp.slug FROM product_pet_links l JOIN product_pets pp ON pp.id = l.pet_id
       JOIN products p ON p.id = l.product_id WHERE p.slug = 'champu-piel-sensible' ORDER BY pp.position`,
    );
    expect(links.map((l) => l.slug)).toEqual(['perro', 'gato']);
  });

  it('guarda null en ingredientes y modo de uso vacíos', async () => {
    await seedCatalog((shop) => {
      product(shop, 'pienso-gato-esterilizado').usage = '   ';
    });
    const [row] = await q(`SELECT ingredients_md, usage_md FROM products WHERE slug = 'pelota-caucho-flotante'`);
    expect(row).toEqual({ ingredients_md: null, usage_md: null });
    const [gato] = await q(`SELECT usage_md FROM products WHERE slug = 'pienso-gato-esterilizado'`);
    expect(gato!.usage_md).toBeNull();
  });

  it('recargar es idempotente y conserva los id', async () => {
    await seedCatalog();
    const before = await productIds();
    await seedCatalog();
    expect(await productIds()).toEqual(before);
    expect(await q('SELECT count(*)::int AS n FROM products')).toEqual([{ n: 24 }]);
    expect(await q('SELECT count(*)::int AS n FROM product_pet_links')).toEqual([{ n: 30 }]);
  });

  it('quitar un producto lo despublica y volver a ponerlo lo republica con el mismo id', async () => {
    await seedCatalog();
    const id = (await productIds()).get('heno-conejo');

    const summary = await seedCatalog((shop) => {
      shop.products = shop.products.filter((p: { slug: string }) => p.slug !== 'heno-conejo');
    });
    expect(summary.productsHidden).toBe(1);
    expect(await q(`SELECT id, published FROM products WHERE slug = 'heno-conejo'`)).toEqual([{ id, published: false }]);

    await seedCatalog();
    expect(await q(`SELECT id, published FROM products WHERE slug = 'heno-conejo'`)).toEqual([{ id, published: true }]);
  });

  it('cambiar las mascotas de un producto reemplaza sus enlaces', async () => {
    await seedCatalog();
    await seedCatalog((shop) => {
      product(shop, 'champu-piel-sensible').pets = ['otros'];
    });
    const links = await q(
      `SELECT pp.slug FROM product_pet_links l JOIN product_pets pp ON pp.id = l.pet_id
       JOIN products p ON p.id = l.product_id WHERE p.slug = 'champu-piel-sensible'`,
    );
    expect(links.map((l) => l.slug)).toEqual(['otros']);
  });

  it('avisa de un compare_at_price menor o igual que el precio', async () => {
    const summary = await seedCatalog((shop) => {
      product(shop, 'heno-conejo').compare_at_price = '6.90';
    });
    expect(summary.compareAtIgnored).toEqual(['heno-conejo']);
  });

  it('una imagen inexistente hace fallar la carga sin escribir nada', async () => {
    await seedCatalog();
    const error = await seedCatalog((shop) => {
      product(shop, 'heno-conejo').image = 'media/petcare/productos/no-existe.svg';
      product(shop, 'pelota-caucho-flotante').name = 'Nombre cambiado';
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as ContentValidationError).issues[0]!.path).toMatch(/^shop\.products\[\d+\]\.image$/);
    expect(await q(`SELECT name FROM products WHERE slug = 'pelota-caucho-flotante'`)).toEqual([
      { name: 'Pelota de caucho flotante' },
    ]);
  });

  it('sin bloque shop: despublica todo el catálogo', async () => {
    await seedCatalog();
    await seedCatalog((_shop, content) => {
      delete content.shop;
      content.sections = content.sections.map((s: { key: string }) =>
        s.key === 'tienda' || s.key === 'carrito' ? { ...s, href: null } : s,
      );
    });
    expect(await q('SELECT count(*)::int AS n FROM products WHERE published')).toEqual([{ n: 0 }]);
    expect(await q('SELECT count(*)::int AS n FROM product_categories WHERE published')).toEqual([{ n: 0 }]);
  });
});
