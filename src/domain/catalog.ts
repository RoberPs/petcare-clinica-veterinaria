// Estado del listado en la query (C5), derivados de oferta y disponibilidad (C2) y pestañas de la
// ficha (C7). TypeScript puro.

export const SORTS = [
  { id: 'destacados', label: 'Destacados' },
  { id: 'precio-asc', label: 'Precio: de menor a mayor' },
  { id: 'precio-desc', label: 'Precio: de mayor a menor' },
  { id: 'novedades', label: 'Novedades primero' },
] as const;

export type SortId = (typeof SORTS)[number]['id'];

export const SEARCH_MAX = 80;
export const CATALOG_PATH = '/productos';

export interface CatalogState {
  pets: string[];
  category: string | null;
  q: string;
  sort: SortId;
  page: number;
}

export type QueryParams = Record<string, string | string[] | undefined>;

const all = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const first = (value: string | string[] | undefined): string | undefined => all(value)[0];

const isSort = (value: string | undefined): value is SortId => SORTS.some((s) => s.id === value);

/** Valida la query del listado. Lo desconocido se ignora sin error (FR-014). */
export function parseCatalogQuery(params: QueryParams, known: { pets: string[]; categories: string[] }): CatalogState {
  const askedPets = new Set(all(params.mascota));
  const pets = known.pets.filter((slug) => askedPets.has(slug));

  const categoryParam = first(params.categoria);
  const category = categoryParam && known.categories.includes(categoryParam) ? categoryParam : null;

  const q = (first(params.q) ?? '').trim().slice(0, SEARCH_MAX).trim();

  const sortParam = first(params.orden);
  const sort: SortId = isSort(sortParam) ? sortParam : 'destacados';

  const pageParam = first(params.pagina) ?? '';
  const page = /^\d{1,6}$/.test(pageParam) && Number(pageParam) >= 1 ? Number(pageParam) : 1;

  return { pets, category, q, sort, page };
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), totalPages(total, pageSize));
}

export function hasFilters(state: CatalogState): boolean {
  return state.pets.length > 0 || state.category !== null || state.q !== '';
}

/** Enlace del listado con un orden de parámetros estable y sin los valores por defecto. */
export function buildCatalogHref(state: CatalogState, patch: Partial<CatalogState> = {}): string {
  const s = { ...state, ...patch };
  const params = new URLSearchParams();
  for (const pet of s.pets) params.append('mascota', pet);
  if (s.category) params.set('categoria', s.category);
  if (s.q) params.set('q', s.q);
  if (s.sort !== 'destacados') params.set('orden', s.sort);
  if (s.page > 1) params.set('pagina', String(s.page));
  const query = params.toString().replace(/\+/g, '%20');
  return query ? `${CATALOG_PATH}?${query}` : CATALOG_PATH;
}

export function onSale(priceCents: number, compareAtCents: number | null): boolean {
  return compareAtCents !== null && compareAtCents > priceCents;
}

export function availability(stock: number, shippingText: string): { inStock: boolean; label: string } {
  return stock > 0 ? { inStock: true, label: `En stock · Envío en ${shippingText}` } : { inStock: false, label: 'Agotado' };
}

export type TabId = 'descripcion' | 'ingredientes' | 'modo-de-uso';

export interface ProductTab {
  id: TabId;
  label: string;
  body: string;
}

const filled = (text: string | null | undefined): text is string => typeof text === 'string' && text.trim() !== '';

/** Pestañas con contenido; la descripción siempre está (FR-007). */
export function productTabs(product: {
  descriptionMd: string;
  ingredientsMd: string | null;
  usageMd: string | null;
}): ProductTab[] {
  const tabs: ProductTab[] = [{ id: 'descripcion', label: 'Descripción', body: product.descriptionMd }];
  if (filled(product.ingredientsMd)) tabs.push({ id: 'ingredientes', label: 'Ingredientes', body: product.ingredientsMd });
  if (filled(product.usageMd)) tabs.push({ id: 'modo-de-uso', label: 'Modo de uso', body: product.usageMd });
  return tabs;
}

/** La pestaña pedida si existe; si no, la descripción. */
export function pickTab(tabs: ProductTab[], requested: string | undefined): ProductTab {
  return tabs.find((t) => t.id === requested) ?? tabs[0]!;
}
