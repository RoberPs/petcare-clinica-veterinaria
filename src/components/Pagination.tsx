import { buildCatalogHref, type CatalogState } from '@/domain/catalog';

// Paginación del catálogo: enlaces normales que conservan los filtros. Nada si hay una sola página.
export function Pagination({ state, pages }: { state: CatalogState; pages: number }) {
  if (pages <= 1) return null;
  const current = state.page;
  return (
    <nav className="pagination" aria-label="Paginación">
      <ul>
        {current > 1 ? (
          <li>
            <a href={buildCatalogHref(state, { page: current - 1 })}>
              Anterior
            </a>
          </li>
        ) : null}
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <a
              href={buildCatalogHref(state, { page: n })}
              aria-label={`Página ${n}`}
              aria-current={n === current ? 'page' : undefined}
            >
              {n}
            </a>
          </li>
        ))}
        {current < pages ? (
          <li>
            <a href={buildCatalogHref(state, { page: current + 1 })}>
              Siguiente
            </a>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
