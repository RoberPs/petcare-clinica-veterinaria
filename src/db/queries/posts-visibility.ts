import { and, eq, lte, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../client';
import { posts, sections } from '../schema';

// Regla de visibilidad de los consejos (E1, E3). Sin React: también la usa el middleware.

/** Única condición de visibilidad: publicada y con fecha de publicación ya alcanzada. */
export function visiblePosts(): SQL {
  return and(eq(posts.published, true), lte(posts.publishedAt, sql`now()`))!;
}

/**
 * ¿Existe esta ruta de consejos? (para el middleware). La sección tiene que estar activa y, si hay
 * slug, la publicación tiene que ser visible. Una sola consulta.
 */
export async function postsRouteExists(slug: string | null): Promise<boolean> {
  const post = slug
    ? sql`exists (select 1 from ${posts} where ${posts.slug} = ${slug} and ${visiblePosts()})`
    : sql`true`;
  const result = await getDb().execute<{ ok: boolean }>(sql`select (
      exists (select 1 from ${sections} where ${sections.key} = 'consejos' and ${sections.href} is not null)
      and ${post}
    ) as ok`);
  return result.rows[0]?.ok === true;
}
