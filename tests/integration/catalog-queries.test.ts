import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  catalogRouteExists,
  countProducts,
  getProductBySlug,
  listProducts,
  listProductSlugs,
  relatedProducts,
  type CatalogFilter,
} from '@/db/queries/catalog';
import type { SortId } from '@/domain/catalog';
import { parseEuros } from '@/domain/money';
import { petcareContent, product, seedCatalog } from './helpers/catalog';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Lecturas del catálogo (C10, C11 y la visibilidad de data-model.md).

interface YamlProduct {
  slug: string;
  name: string;
  category: string;
  pets: string[];
  price: string;
  stock: number;
  is_new?: boolean;
}

const yamlProducts = (): (YamlProduct & { position: number; cents: number })[] =>
  (petcareContent().shop.products as YamlProduct[]).map((p, position) => ({ ...p, position, cents: parseEuros(p.price)! }));

type Row = ReturnType<typeof yamlProducts>[number];
const featured = (a: Row, b: Row) => Number(b.stock > 0) - Number(a.stock > 0) || a.position - b.position;
const comparators: Record<SortId, (a: Row, b: Row) => number> = {
  destacados: featured,
  'precio-asc': (a, b) => a.cents - b.cents || featured(a, b),
  'precio-desc': (a, b) => b.cents - a.cents || featured(a, b),
  novedades: (a, b) => Number(!!b.is_new) - Number(!!a.is_new) || featured(a, b),
};

/** Lo que debería devolver el listado completo, calculado desde el YAML. */
function expected(filter: CatalogFilter = {}): string[] {
  return yamlProducts()
    .filter((p) => !filter.pets?.length || p.pets.some((pet) => filter.pets!.includes(pet)))
    .filter((p) => !filter.category || p.category === filter.category)
    .sort(comparators[filter.sort ?? 'destacados'])
    .map((p) => p.slug);
}

const all = async (filter: CatalogFilter = {}) =>
  (await listProducts({ ...filter, page: 1, pageSize: 48 })).map((p) => p.slug);

describe('consultas del catálogo', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedCatalog();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  describe('listado', () => {
    it('sin filtros devuelve los visibles en orden "destacados": en stock por posición y luego los agotados', async () => {
      const slugs = await all();
      expect(slugs).toEqual(expected());
      expect(slugs.slice(-2)).toEqual(['arena-aglomerante-gato', 'varita-plumas-gato']);
      expect(await countProducts({})).toBe(24);
    });

    it('devuelve los datos de la tarjeta', async () => {
      const [first] = await listProducts({ page: 1, pageSize: 12 });
      expect(first).toMatchObject({
        slug: 'pienso-perro-adulto',
        name: 'Pienso de pollo para perro adulto, 12 kg',
        categoryName: 'Alimentación',
        pets: ['Perro'],
        priceCents: 4250,
        compareAtCents: 4790,
        stock: 14,
        isNew: true,
        imagePath: '/media/petcare/productos/pienso-perro-adulto.svg',
      });
      const champu = (await listProducts({ page: 1, pageSize: 48 })).find((p) => p.slug === 'champu-piel-sensible');
      expect(champu!.pets).toEqual(['Perro', 'Gato']);
    });

    it('pagina con page_size y desplazamiento', async () => {
      const page1 = await listProducts({ page: 1, pageSize: 12 });
      const page2 = await listProducts({ page: 2, pageSize: 12 });
      const page3 = await listProducts({ page: 3, pageSize: 12 });
      expect(page1).toHaveLength(12);
      expect(page2.map((p) => p.slug)).toEqual(expected().slice(12, 24));
      expect(page3).toHaveLength(0);
    });

    it('nunca aparecen un producto despublicado, uno de categoría despublicada ni uno sin mascotas publicadas', async () => {
      await seedCatalog((shop) => {
        shop.products = shop.products.filter((p: { slug: string }) => p.slug !== 'pienso-perro-adulto');
      });
      await q(`UPDATE product_categories SET published = false WHERE slug = 'juguetes'`);
      await q(`UPDATE product_pets SET published = false WHERE slug = 'otros'`);

      const slugs = await all();
      expect(slugs).not.toContain('pienso-perro-adulto');
      expect(slugs.filter((s) => ['pelota-caucho-flotante', 'raton-hierba-gatera', 'tunel-roedores', 'varita-plumas-gato'].includes(s))).toEqual([]);
      expect(slugs.filter((s) => ['heno-conejo', 'bebedero-roedores', 'complemento-vitaminico-aves'].includes(s))).toEqual([]);
      // El transportín (gato y otros) sigue visible, solo con su mascota publicada.
      const transportin = (await listProducts({ page: 1, pageSize: 48 })).find((p) => p.slug === 'transportin-ventilado');
      expect(transportin!.pets).toEqual(['Gato']);
      expect(await countProducts({})).toBe(slugs.length);
      expect(slugs).toHaveLength(24 - 1 - 4 - 3);
    });
  });

  describe('ficha', () => {
    it('devuelve el producto con su categoría y sus mascotas ordenadas', async () => {
      const p = await getProductBySlug('champu-piel-sensible');
      expect(p).toMatchObject({
        slug: 'champu-piel-sensible',
        name: 'Champú para piel sensible 250 ml',
        categoryName: 'Higiene',
        pets: ['Perro', 'Gato'],
        priceCents: 1290,
        stock: 18,
        shortDescription: 'Champú suave con avena, sin perfume, para pieles delicadas.',
      });
      expect(p!.descriptionMd).toContain('Limpia sin resecar');
      expect(p!.petIds).toHaveLength(2);
      expect((await getProductBySlug('pelota-caucho-flotante'))!).toMatchObject({ ingredientsMd: null, usageMd: null });
    });

    it('devuelve null si el slug no existe o el producto no es visible', async () => {
      expect(await getProductBySlug('no-existe')).toBeNull();
      await seedCatalog((shop) => {
        shop.products = shop.products.filter((p: { slug: string }) => p.slug !== 'heno-conejo');
      });
      expect(await getProductBySlug('heno-conejo')).toBeNull();
      await q(`UPDATE product_categories SET published = false WHERE slug = 'juguetes'`);
      expect(await getProductBySlug('pelota-caucho-flotante')).toBeNull();
      await q(`UPDATE product_pets SET published = false WHERE slug = 'otros'`);
      expect(await getProductBySlug('bebedero-roedores')).toBeNull();
      expect(await getProductBySlug('transportin-ventilado')).not.toBeNull();
    });

    it('catalogRouteExists decide el 404 del middleware', async () => {
      expect(await catalogRouteExists(null)).toBe(true);
      expect(await catalogRouteExists('pienso-perro-adulto')).toBe(true);
      expect(await catalogRouteExists('no-existe')).toBe(false);
      await q(`UPDATE product_categories SET published = false WHERE slug = 'juguetes'`);
      expect(await catalogRouteExists('pelota-caucho-flotante')).toBe(false);
      await q(`UPDATE sections SET href = NULL WHERE key = 'tienda'`);
      expect(await catalogRouteExists(null)).toBe(false);
      expect(await catalogRouteExists('pienso-perro-adulto')).toBe(false);
    });

    it('listProductSlugs devuelve solo los visibles (sitemap)', async () => {
      await q(`UPDATE product_categories SET published = false WHERE slug = 'juguetes'`);
      const slugs = (await listProductSlugs()).map((p) => p.slug);
      expect(slugs).toHaveLength(20);
      expect(slugs).not.toContain('pelota-caucho-flotante');
    });
  });

  describe('filtros y orden', () => {
    const combos: CatalogFilter[] = [
      { pets: ['gato'] },
      { pets: ['gato', 'otros'] },
      { category: 'higiene' },
      { pets: ['gato'], category: 'higiene' },
      { pets: ['perro'], category: 'accesorios', sort: 'precio-desc' },
      { pets: ['otros'], sort: 'novedades' },
      { sort: 'precio-asc' },
      { sort: 'precio-desc' },
      { sort: 'novedades' },
    ];

    for (const filter of combos) {
      it(`${JSON.stringify(filter)} coincide con el YAML y con el total`, async () => {
        const slugs = await all(filter);
        expect(slugs).toEqual(expected(filter));
        expect(await countProducts(filter)).toBe(slugs.length);
      });
    }

    it('varias mascotas se combinan con O sin duplicar el producto que tiene varias', async () => {
      const slugs = await all({ pets: ['gato', 'otros'] });
      expect(slugs.filter((s) => s === 'transportin-ventilado')).toHaveLength(1);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('el mismo precio se desempata con "destacados"', async () => {
      const asc = await all({ sort: 'precio-asc' });
      expect(asc.indexOf('cepillo-desenredante')).toBe(asc.indexOf('tunel-roedores') - 1);
      expect(asc.indexOf('heno-conejo')).toBe(asc.indexOf('pasta-malta-gato') - 1);
      const desc = await all({ sort: 'precio-desc' });
      expect(desc.indexOf('cepillo-desenredante')).toBe(desc.indexOf('tunel-roedores') - 1);
    });

    it('novedades primero y luego "destacados"', async () => {
      expect((await all({ sort: 'novedades' })).slice(0, 2)).toEqual(['pienso-perro-adulto', 'rascador-torre']);
    });

    it('una categoría sin productos devuelve 0', async () => {
      await seedCatalog((shop) => {
        shop.categories.push({ slug: 'vacia', name: 'Vacía' });
      });
      expect(await all({ category: 'vacia' })).toEqual([]);
      expect(await countProducts({ category: 'vacia' })).toBe(0);
    });
  });

  describe('búsqueda', () => {
    it('encuentra sin distinguir mayúsculas ni tildes', async () => {
      for (const term of ['champu', 'CHAMPÚ', 'Champú', '  champu  ']) {
        expect(await all({ q: term })).toEqual(['champu-piel-sensible']);
      }
      expect(await all({ q: 'pienso' })).toEqual(['pienso-perro-adulto', 'pienso-gato-esterilizado']);
      expect(await all({ q: 'zzz' })).toEqual([]);
    });

    it('trata % y _ como texto literal', async () => {
      await seedCatalog((shop) => {
        product(shop, 'heno-conejo').name = 'Heno 100% natural';
      });
      expect(await all({ q: '100%' })).toEqual(['heno-conejo']);
      expect(await all({ q: '%' })).toEqual(['heno-conejo']);
      expect(await all({ q: '_' })).toEqual([]);
      expect(await countProducts({ q: '_' })).toBe(0);
    });

    it('se combina con mascota, categoría y orden, y el total coincide', async () => {
      const filter: CatalogFilter = { q: 'gato', pets: ['gato'], category: 'alimentacion', sort: 'precio-asc' };
      expect(await all(filter)).toEqual(['comida-humeda-gato', 'pienso-gato-esterilizado']);
      expect(await countProducts(filter)).toBe(2);
      expect(await all({ q: 'pienso', pets: ['gato'] })).toEqual(['pienso-gato-esterilizado']);
    });
  });

  describe('relacionados', () => {
    const relatedOf = async (slug: string) => {
      const p = (await getProductBySlug(slug))!;
      return (await relatedProducts(p.id, p.categoryId, p.petIds)).map((r) => r.slug);
    };

    it('comparten categoría o mascota, con los de stock y la misma categoría primero', async () => {
      expect(await relatedOf('champu-piel-sensible')).toEqual(['toallitas-limpieza', 'cepillo-desenredante', 'pienso-perro-adulto']);
    });

    it('nunca incluyen el producto actual ni uno no visible, y como máximo 3', async () => {
      await seedCatalog((shop) => {
        shop.products = shop.products.filter((p: { slug: string }) => p.slug !== 'toallitas-limpieza');
      });
      const related = await relatedOf('champu-piel-sensible');
      expect(related).toEqual(['cepillo-desenredante', 'pienso-perro-adulto', 'pienso-gato-esterilizado']);
      expect(related).not.toContain('champu-piel-sensible');
    });

    it('los agotados van detrás de los que hay en stock, aunque sean de la misma categoría', async () => {
      // Ratón (juguetes, gato): la caña (juguetes, agotada) queda detrás del pienso de gato (otra categoría).
      expect(await relatedOf('raton-hierba-gatera')).toEqual(['pelota-caucho-flotante', 'tunel-roedores', 'pienso-gato-esterilizado']);
    });

    it('un producto sin relacionados da una lista vacía', async () => {
      await seedCatalog((shop) => {
        shop.categories.push({ slug: 'unica', name: 'Única' });
        shop.pets.push({ slug: 'exotico', name: 'Exótico' });
        product(shop, 'bebedero-roedores').category = 'unica';
        product(shop, 'bebedero-roedores').pets = ['exotico'];
      });
      expect(await relatedOf('bebedero-roedores')).toEqual([]);
    });
  });
});
