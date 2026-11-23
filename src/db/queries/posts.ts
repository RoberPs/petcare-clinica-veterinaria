import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { cache } from 'react';
import { escapeLike } from '@/domain/search';
import { getDb } from '../client';
import { postCategories, posts } from '../schema';
import { postsRouteExists, visiblePosts } from './posts-visibility';

// Lecturas de los consejos de salud (feature 006). Toda consulta de publicaciones usa
// visiblePosts() como condición: nunca se filtra `published` ni la fecha a mano en otra consulta.

export { postsRouteExists, visiblePosts };

export type PostKind = 'article' | 'news';

export interface PostCategory {
  key: string;
  label: string;
}

export interface PostSummary {
  id: string;
  slug: string;
  kind: PostKind;
  categoryKey: string | null;
  categoryLabel: string | null;
  title: string;
  image: string | null;
  imageAlt: string | null;
  publishedAt: Date;
}

export interface PostDetail extends PostSummary {
  lead: string;
  bodyMd: string;
  metaDescription: string;
  updatedAt: Date;
}

const summaryColumns = {
  id: posts.id,
  slug: posts.slug,
  kind: posts.kind,
  categoryKey: posts.categoryKey,
  categoryLabel: postCategories.label,
  title: posts.title,
  image: posts.image,
  imageAlt: posts.imageAlt,
  publishedAt: posts.publishedAt,
};

/** Categorías en el orden del archivo de contenido (pestañas). */
export const listCategories = cache(async (): Promise<PostCategory[]> => {
  return getDb()
    .select({ key: postCategories.key, label: postCategories.label })
    .from(postCategories)
    .orderBy(asc(postCategories.sortOrder), asc(postCategories.key));
});

/** Publicación visible por slug, o null. */
export const getVisiblePostBySlug = cache(async (slug: string): Promise<PostDetail | null> => {
  const [row] = await getDb()
    .select({
      ...summaryColumns,
      lead: posts.lead,
      bodyMd: posts.bodyMd,
      metaDescription: posts.metaDescription,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.key, posts.categoryKey))
    .where(and(eq(posts.slug, slug), visiblePosts()))
    .limit(1);
  return row ?? null;
});

/** Slugs visibles con su fecha de modificación (sitemap). */
export async function listVisiblePostSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return getDb()
    .select({ slug: posts.slug, updatedAt: posts.updatedAt })
    .from(posts)
    .where(visiblePosts())
    .orderBy(desc(posts.publishedAt), asc(posts.id));
}

export interface PostsFilter {
  kind?: PostKind;
  categoryKey?: string | null;
  /** Palabras ya normalizadas (searchWords): todas tienen que aparecer. */
  words?: string[];
}

function filterWhere(filter: PostsFilter): SQL {
  const conditions: SQL[] = [visiblePosts()];
  if (filter.kind) conditions.push(eq(posts.kind, filter.kind));
  if (filter.categoryKey) conditions.push(eq(posts.categoryKey, filter.categoryKey));
  for (const word of filter.words ?? []) {
    conditions.push(sql`${posts.searchText} like ${`%${escapeLike(word)}%`} escape '\'`);
  }
  return and(...conditions)!;
}

/** Una página del listado, por fecha de publicación descendente. */
export async function listPosts(filter: PostsFilter & { page: number; pageSize: number }): Promise<PostSummary[]> {
  const page = Math.max(1, Math.floor(filter.page));
  return getDb()
    .select(summaryColumns)
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.key, posts.categoryKey))
    .where(filterWhere(filter))
    .orderBy(desc(posts.publishedAt), asc(posts.id))
    .limit(filter.pageSize)
    .offset((page - 1) * filter.pageSize);
}

/** Total de publicaciones que cumplen el filtro (para la paginación). */
export async function countPosts(filter: PostsFilter): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(posts).where(filterWhere(filter));
  return row?.n ?? 0;
}
