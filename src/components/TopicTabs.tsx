import type { PostCategory } from '@/db/queries/posts';
import { buildPostsHref, type PostsState } from '@/domain/posts-query';

// Pestañas de categoría (US3): enlaces GET que conservan la búsqueda y vuelven a la página 1.
export function TopicTabs({ categories, state }: { categories: PostCategory[]; state: PostsState }) {
  const tabs = [{ key: null, label: 'Todas' }, ...categories];
  return (
    <section className="band band--tabs">
      <nav className="container" aria-label="Categorías">
        <ul className="topic-tabs">
          {tabs.map((t) => (
            <li key={t.key ?? 'todas'}>
              <a
                className="topic-tab"
                href={buildPostsHref(state, { category: t.key, page: 1, news: false })}
                aria-current={state.category === t.key ? 'page' : undefined}
              >
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
