import { POSTS_PATH, POSTS_SEARCH_MAX, type PostsState } from '@/domain/posts-query';

// Buscador de consejos (US3): formulario GET que conserva la categoría elegida. Sin JavaScript.
export function PostsSearch({ state }: { state: PostsState }) {
  return (
    <form method="get" action={`${POSTS_PATH}#resultados`} role="search" aria-label="Buscar en los consejos">
      <label htmlFor="consejos-q" className="search-label">
        Busca datos y consejos entre nuestras publicaciones
      </label>
      <div className="search">
        {state.category ? <input type="hidden" name="categoria" value={state.category} /> : null}
        <input
          id="consejos-q"
          type="search"
          name="q"
          maxLength={POSTS_SEARCH_MAX}
          defaultValue={state.q}
          placeholder="Por ejemplo: baño, vacunas…"
        />
        <button type="submit">Buscar</button>
      </div>
    </form>
  );
}
