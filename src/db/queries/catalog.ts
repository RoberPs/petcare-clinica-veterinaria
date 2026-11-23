import { and, asc, count, desc, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import { cache } from 'react';
import type { SortId } from '@/domain/catalog';
import { escapeLike, normalizeSearch } from '@/domain/search';
import { getDb } from '../client';
import { productCategories, productPetLinks, productPets, products, shopSettings } from '../schema';
import { catalogRouteExists, publishedProducts } from './catalog-visibility';

// Lecturas del catálogo (feature 004). Toda consulta de productos usa publishedProducts() como
// condición: nunca se filtra `published` a mano en otra consulta.

export { catalogRouteExists, publishedProducts };

/** Nombres de las mascotas publicadas del producto, en el orden de los filtros. */
const petNames = sql<string[]>`array(select pp.name from ${productPetLinks} l join ${productPets} pp on pp.id = l.pet_id
  where l.product_id = ${products.id} and pp.published order by pp.position, pp.slug)`;

const summaryColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  categoryName: productCategories.name,
  pets: petNames,
  priceCents: products.priceCents,
  compareAtCents: products.compareAtCents,
  stock: products.stock,
  isNew: products.isNew,
  imagePath: products.imagePath,
  imageAlt: products.imageAlt,
};

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  pets: string[];
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  isNew: boolean;
  imagePath: string | null;
  imageAlt: string | null;
}

/** Tarjetas de producto con su categoría. Se combina siempre con publishedProducts(). */
function summaries() {
  return getDb()
    .select(summaryColumns)
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .$dynamic();
}

export interface CatalogFilter {
  /** Slugs de mascota: se combinan con O. */
  pets?: string[];
  /** Slug de categoría: se combina con Y. */
  category?: string | null;
  q?: string;
  sort?: SortId;
}

const inList = (values: string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);

function filterWhere(filter: CatalogFilter): SQL {
  const conditions: SQL[] = [publishedProducts()];
  if (filter.pets?.length) {
    conditions.push(sql`exists (select 1 from ${productPetLinks} l join ${productPets} pp on pp.id = l.pet_id
      where l.product_id = ${products.id} and pp.published and pp.slug in (${inList(filter.pets)}))`);
  }
  if (filter.category) conditions.push(eq(productCategories.slug, filter.category));
  const term = normalizeSearch(filter.q ?? '');
  if (term) conditions.push(sql`${products.searchName} like ${`%${escapeLike(term)}%`} escape '\\'`);
  return and(...conditions)!;
}

const inStock = sql`(${products.stock} > 0)`;
/** Cola común de todas las ordenaciones (C10): en stock, posición e id. */
const featuredOrder = [desc(inStock), asc(products.position), asc(products.id)];
const ORDER: Record<SortId, SQL[]> = {
  destacados: featuredOrder,
  'precio-asc': [asc(products.priceCents), ...featuredOrder],
  'precio-desc': [desc(products.priceCents), ...featuredOrder],
  novedades: [desc(products.isNew), ...featuredOrder],
};

/** Una página del listado con los filtros, la búsqueda y el orden. */
export async function listProducts(
  filter: CatalogFilter & { page: number; pageSize: number },
): Promise<ProductSummary[]> {
  return summaries()
    .where(filterWhere(filter))
    .orderBy(...ORDER[filter.sort ?? 'destacados'])
    .limit(filter.pageSize)
    .offset((Math.max(1, filter.page) - 1) * filter.pageSize);
}

/** Total con el mismo WHERE que el listado. */
export async function countProducts(filter: CatalogFilter): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(filterWhere(filter));
  return row?.n ?? 0;
}

export interface ProductDetail extends ProductSummary {
  categoryId: string;
  petIds: string[];
  shortDescription: string;
  descriptionMd: string;
  ingredientsMd: string | null;
  usageMd: string | null;
}

const petIdsColumn = sql<string[]>`array(select l.pet_id from ${productPetLinks} l join ${productPets} pp on pp.id = l.pet_id
  where l.product_id = ${products.id} and pp.published order by pp.position, pp.slug)`;

/** Ficha de un producto visible, o null. */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const [row] = await getDb()
    .select({
      ...summaryColumns,
      categoryId: products.categoryId,
      petIds: petIdsColumn,
      shortDescription: products.shortDescription,
      descriptionMd: products.descriptionMd,
      ingredientsMd: products.ingredientsMd,
      usageMd: products.usageMd,
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(and(publishedProducts(), eq(products.slug, slug)))
    .limit(1);
  return row ?? null;
}

/** "También te puede interesar" (C11): hasta 3 visibles que compartan categoría o mascota. */
export async function relatedProducts(productId: string, categoryId: string, petIds: string[]): Promise<ProductSummary[]> {
  const sharesPet = petIds.length
    ? sql`exists (select 1 from ${productPetLinks} l where l.product_id = ${products.id} and l.pet_id in (${inList(petIds)}))`
    : sql`false`;
  const sameCategory = sql`(${products.categoryId} = ${categoryId})`;
  return summaries()
    .where(and(publishedProducts(), ne(products.id, productId), or(sameCategory, sharesPet)))
    .orderBy(desc(inStock), desc(sameCategory), asc(products.position), asc(products.id))
    .limit(3);
}

/** Fichas visibles para el sitemap. */
export async function listProductSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return getDb()
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(publishedProducts())
    .orderBy(asc(products.position), asc(products.id));
}

export type ShopSettings = typeof shopSettings.$inferSelect;

export const getShopSettings = cache(async (): Promise<ShopSettings | null> => {
  const [row] = await getDb().select().from(shopSettings).limit(1);
  return row ?? null;
});

export interface CatalogFilters {
  categories: { slug: string; name: string }[];
  pets: { slug: string; name: string }[];
}

/** Categorías y mascotas publicadas, en el orden de los filtros. */
export const getCatalogFilters = cache(async (): Promise<CatalogFilters> => {
  const db = getDb();
  const [categories, pets] = await Promise.all([
    db
      .select({ slug: productCategories.slug, name: productCategories.name })
      .from(productCategories)
      .where(eq(productCategories.published, true))
      .orderBy(asc(productCategories.position), asc(productCategories.slug)),
    db
      .select({ slug: productPets.slug, name: productPets.name })
      .from(productPets)
      .where(eq(productPets.published, true))
      .orderBy(asc(productPets.position), asc(productPets.slug)),
  ]);
  return { categories, pets };
});
