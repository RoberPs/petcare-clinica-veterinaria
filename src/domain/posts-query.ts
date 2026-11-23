import { z } from 'zod';

// Estado del listado de consejos en la query (E5, contracts/routes.md). TypeScript puro.

export const POSTS_PATH = '/consejos';
export const POSTS_PAGE_SIZE = 12;
export const NEWS_PREVIEW = 3;
export const POSTS_SEARCH_MAX = 100;

export interface PostsState {
  /** Clave de una categoría existente, o null. */
  category: string | null;
  /** Texto buscado tal cual (recortado); '' = sin búsqueda. */
  q: string;
  /** Solo "Ver todas las noticias"; se ignora si hay filtro o búsqueda. */
  news: boolean;
  page: number;
}

export type PostsView = 'default' | 'news' | 'results';

export type QueryParams = Record<string, string | string[] | undefined>;

const firstValue = z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().optional().catch(undefined));

const querySchema = z.object({
  categoria: firstValue,
  q: firstValue.transform((v) => (v ?? '').trim().slice(0, POSTS_SEARCH_MAX).trim()),
  tipo: firstValue,
  pagina: firstValue.transform((v) => (v && /^\d{1,6}$/.test(v) && Number(v) >= 1 ? Number(v) : 1)),
});

/** Valida la query del listado. Lo desconocido se ignora sin error. */
export function parsePostsQuery(params: QueryParams, knownCategories: readonly string[]): PostsState {
  const p = querySchema.parse(params);
  const category = p.categoria && knownCategories.includes(p.categoria) ? p.categoria : null;
  const q = p.q;
  const news = p.tipo === 'noticias' && category === null && q === '';
  return { category, q, news, page: p.pagina };
}

export function hasPostsCriteria(state: PostsState): boolean {
  return state.category !== null || state.q !== '';
}

/** default: artículos + 3 noticias; news: todas las noticias; results: lista combinada. */
export function postsView(state: PostsState): PostsView {
  if (hasPostsCriteria(state)) return 'results';
  return state.news ? 'news' : 'default';
}

/** Enlace del listado con un orden de parámetros estable, sin la página 1 ni valores vacíos. */
export function buildPostsHref(state: PostsState, patch: Partial<PostsState> = {}): string {
  const s = { ...state, ...patch };
  const params = new URLSearchParams();
  if (s.category) params.set('categoria', s.category);
  if (s.q) params.set('q', s.q);
  if (s.news && !s.category && !s.q) params.set('tipo', 'noticias');
  if (s.page > 1) params.set('pagina', String(s.page));
  const query = params.toString().replace(/\+/g, '%20');
  return query ? `${POSTS_PATH}?${query}` : POSTS_PATH;
}
