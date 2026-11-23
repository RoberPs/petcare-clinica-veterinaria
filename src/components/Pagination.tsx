// Paginación del catálogo y de los consejos: enlaces normales que conservan los filtros (hrefFor).
// Nada si hay una sola página.
export function Pagination({
  current,
  pages,
  hrefFor,
}: {
  current: number;
  pages: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginación">
      <ul>
        {current > 1 ? (
          <li>
            <a href={hrefFor(current - 1)}>Anterior</a>
          </li>
        ) : null}
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <a href={hrefFor(n)} aria-label={`Página ${n}`} aria-current={n === current ? 'page' : undefined}>
              {n}
            </a>
          </li>
        ))}
        {current < pages ? (
          <li>
            <a href={hrefFor(current + 1)}>Siguiente</a>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
