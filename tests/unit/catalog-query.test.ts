import { describe, expect, it } from 'vitest';
import {
  availability,
  buildCatalogHref,
  clampPage,
  onSale,
  parseCatalogQuery,
  pickTab,
  productTabs,
  SORTS,
  type CatalogState,
} from '@/domain/catalog';

const known = { pets: ['perro', 'gato', 'otros'], categories: ['alimentacion', 'higiene'] };
const parse = (params: Record<string, string | string[] | undefined>) => parseCatalogQuery(params, known);
const base: CatalogState = { pets: [], category: null, q: '', sort: 'destacados', page: 1 };

describe('parseCatalogQuery', () => {
  it('sin parámetros devuelve los valores por defecto', () => {
    expect(parse({})).toEqual(base);
  });

  it('descarta mascotas desconocidas y repetidas, y las ordena como los filtros', () => {
    expect(parse({ mascota: ['otros', 'dragon', 'perro', 'otros'] }).pets).toEqual(['perro', 'otros']);
    expect(parse({ mascota: 'gato' }).pets).toEqual(['gato']);
  });

  it('descarta una categoría desconocida', () => {
    expect(parse({ categoria: 'juguetes' }).category).toBeNull();
    expect(parse({ categoria: '' }).category).toBeNull();
    expect(parse({ categoria: 'higiene' }).category).toBe('higiene');
    expect(parse({ categoria: ['higiene', 'alimentacion'] }).category).toBe('higiene');
  });

  it('un orden desconocido es "destacados"', () => {
    expect(parse({ orden: 'x' }).sort).toBe('destacados');
    expect(parse({ orden: 'precio-desc' }).sort).toBe('precio-desc');
  });

  it.each(['abc', '0', '-3', '1.5', '', '2abc'])('pagina=%j → 1', (pagina) => {
    expect(parse({ pagina }).page).toBe(1);
  });

  it('acepta una página numérica', () => {
    expect(parse({ pagina: '3' }).page).toBe(3);
  });

  it('recorta q a 80 caracteres y vacía la búsqueda solo con espacios', () => {
    expect(parse({ q: 'a'.repeat(200) }).q).toHaveLength(80);
    expect(parse({ q: '    ' }).q).toBe('');
    expect(parse({ q: '  champú ' }).q).toBe('champú');
  });
});

describe('clampPage', () => {
  it('ajusta la página al rango existente', () => {
    expect(clampPage(999, 24, 12)).toBe(2);
    expect(clampPage(0, 24, 12)).toBe(1);
    expect(clampPage(5, 0, 12)).toBe(1);
    expect(clampPage(3, 25, 12)).toBe(3);
  });
});

describe('buildCatalogHref', () => {
  it('sin filtros es /productos', () => {
    expect(buildCatalogHref(base)).toBe('/productos');
  });

  it('usa un orden de parámetros estable y omite los valores por defecto', () => {
    const state: CatalogState = { pets: ['gato', 'otros'], category: 'higiene', q: 'champú', sort: 'precio-asc', page: 1 };
    expect(buildCatalogHref(state)).toBe(
      '/productos?mascota=gato&mascota=otros&categoria=higiene&q=champ%C3%BA&orden=precio-asc',
    );
  });

  it('un patch de página conserva los filtros', () => {
    const state: CatalogState = { ...base, pets: ['perro'], sort: 'novedades' };
    expect(buildCatalogHref(state, { page: 2 })).toBe('/productos?mascota=perro&orden=novedades&pagina=2');
    expect(buildCatalogHref({ ...state, page: 2 }, { page: 1 })).toBe('/productos?mascota=perro&orden=novedades');
  });
});

describe('SORTS', () => {
  it('tiene las cuatro ordenaciones con sus etiquetas', () => {
    expect(SORTS.map((s) => [s.id, s.label])).toEqual([
      ['destacados', 'Destacados'],
      ['precio-asc', 'Precio: de menor a mayor'],
      ['precio-desc', 'Precio: de mayor a menor'],
      ['novedades', 'Novedades primero'],
    ]);
  });
});

describe('onSale', () => {
  it('solo hay oferta si el precio anterior es mayor', () => {
    expect(onSale(990, 1200)).toBe(true);
    expect(onSale(990, 990)).toBe(false);
    expect(onSale(990, 500)).toBe(false);
    expect(onSale(990, null)).toBe(false);
  });
});

describe('availability', () => {
  it('en stock incluye el plazo de envío', () => {
    expect(availability(3, '24-48 h')).toEqual({ inStock: true, label: 'En stock · Envío en 24-48 h' });
  });

  it('con stock 0 es "Agotado"', () => {
    expect(availability(0, '24-48 h')).toEqual({ inStock: false, label: 'Agotado' });
  });
});

describe('productTabs', () => {
  it('incluye las tres pestañas con contenido', () => {
    const tabs = productTabs({ descriptionMd: 'Desc', ingredientsMd: 'Ing', usageMd: 'Uso' });
    expect(tabs.map((t) => [t.id, t.label, t.body])).toEqual([
      ['descripcion', 'Descripción', 'Desc'],
      ['ingredientes', 'Ingredientes', 'Ing'],
      ['modo-de-uso', 'Modo de uso', 'Uso'],
    ]);
  });

  it('omite ingredientes y modo de uso vacíos o nulos', () => {
    expect(productTabs({ descriptionMd: 'Desc', ingredientsMd: null, usageMd: '   ' }).map((t) => t.id)).toEqual([
      'descripcion',
    ]);
  });

  it('pickTab elige la pestaña pedida o la descripción', () => {
    const tabs = productTabs({ descriptionMd: 'Desc', ingredientsMd: 'Ing', usageMd: null });
    expect(pickTab(tabs, 'ingredientes').id).toBe('ingredientes');
    expect(pickTab(tabs, 'modo-de-uso').id).toBe('descripcion');
    expect(pickTab(tabs, 'xyz').id).toBe('descripcion');
    expect(pickTab(tabs, undefined).id).toBe('descripcion');
  });
});
