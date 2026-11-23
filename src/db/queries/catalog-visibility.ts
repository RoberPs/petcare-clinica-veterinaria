import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../client';
import { productCategories, productPetLinks, productPets, products, sections, shopSettings } from '../schema';

// Regla de visibilidad del catálogo (data-model.md). Sin React: también la usa el middleware.

/**
 * Visibilidad pública: producto publicado, categoría publicada y al menos una mascota publicada
 * enlazada. Exige el join con product_categories.
 */
export function publishedProducts(): SQL {
  return and(
    eq(products.published, true),
    eq(productCategories.published, true),
    sql`exists (select 1 from ${productPetLinks} l join ${productPets} pp on pp.id = l.pet_id
      where l.product_id = ${products.id} and pp.published)`,
  )!;
}

/**
 * ¿Existe esta ruta del catálogo? (para el middleware). La tienda tiene que estar activa y
 * configurada y, si hay slug, el producto tiene que ser visible. Una sola consulta.
 */
export async function catalogRouteExists(slug: string | null): Promise<boolean> {
  const product = slug
    ? sql`exists (select 1 from ${products} join ${productCategories} on ${productCategories.id} = ${products.categoryId}
        where ${products.slug} = ${slug} and ${publishedProducts()})`
    : sql`true`;
  const result = await getDb().execute<{ ok: boolean }>(sql`select (
      exists (select 1 from ${sections} where ${sections.key} = 'tienda' and ${sections.href} is not null)
      and exists (select 1 from ${shopSettings})
      and ${product}
    ) as ok`);
  return result.rows[0]?.ok === true;
}
