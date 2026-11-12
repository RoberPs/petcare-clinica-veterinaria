import { SEARCH_MAX, SORTS, type CatalogState } from '@/domain/catalog';
import type { CatalogFilters as Filters } from '@/db/queries/catalog';

// Filtros del catálogo (C6): un único formulario GET que funciona sin JavaScript. No se envía al
// cambiar un valor (WCAG 3.2.2): se aplica con el botón o con Intro.
export function CatalogFilters({ filters, state }: { filters: Filters; state: CatalogState }) {
  return (
    <aside className="shop-filters" aria-label="Filtros">
      <form method="get" action="/productos#resultados" role="search" aria-label="Buscar y filtrar productos">
        <div className="search">
          <label htmlFor="q" className="visually-hidden">
            Buscar producto
          </label>
          <input id="q" type="search" name="q" maxLength={SEARCH_MAX} defaultValue={state.q} placeholder="Nombre del producto" />
        </div>

        <fieldset>
          <legend>Mascota</legend>
          {filters.pets.map((p) => (
            <label key={p.slug}>
              <input type="checkbox" name="mascota" value={p.slug} defaultChecked={state.pets.includes(p.slug)} />
              {p.name}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Categoría</legend>
          <label>
            <input type="radio" name="categoria" value="" defaultChecked={state.category === null} />
            Todas
          </label>
          {filters.categories.map((c) => (
            <label key={c.slug}>
              <input type="radio" name="categoria" value={c.slug} defaultChecked={state.category === c.slug} />
              {c.name}
            </label>
          ))}
        </fieldset>

        <div className="field">
          <label htmlFor="orden">Ordenar por</label>
          <select id="orden" name="orden" className="select" defaultValue={state.sort}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn">
          Aplicar
        </button>
      </form>
    </aside>
  );
}
