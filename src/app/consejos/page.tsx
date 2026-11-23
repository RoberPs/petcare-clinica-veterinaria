import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ArticleCard } from '@/components/ArticleCard';
import { NewsletterBlock } from '@/components/NewsletterBlock';
import { Pagination } from '@/components/Pagination';
import { PostsSearch } from '@/components/PostsSearch';
import { TopicTabs } from '@/components/TopicTabs';
import { clampPage, totalPages } from '@/domain/catalog';
import {
  buildPostsHref,
  hasPostsCriteria,
  NEWS_PREVIEW,
  parsePostsQuery,
  POSTS_PAGE_SIZE,
  POSTS_PATH,
  postsView,
  type PostsState,
  type QueryParams,
} from '@/domain/posts-query';
import { searchWords } from '@/domain/search';
import { isSectionEnabled } from '@/domain/sections';
import { countPosts, listCategories, listPosts, type PostKind, type PostsFilter, type PostSummary } from '@/db/queries/posts';
import { getSiteData } from '@/db/queries/site';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<QueryParams>;

interface Block {
  items: PostSummary[];
  total: number;
  page: number;
  pages: number;
}

async function pagedBlock(filter: PostsFilter, requestedPage: number, pageSize: number): Promise<Block> {
  const total = await countPosts(filter);
  const page = clampPage(requestedPage, total, pageSize);
  const items = total > 0 ? await listPosts({ ...filter, page, pageSize }) : [];
  return { items, total, page, pages: totalPages(total, pageSize) };
}

/** Datos de la vista (E5); se comparte entre la página y generateMetadata. */
const listing = cache(async (key: string) => {
  const state = JSON.parse(key) as PostsState;
  const view = postsView(state);
  if (view === 'results') {
    const filter: PostsFilter = { categoryKey: state.category, words: searchWords(state.q) };
    const results = await pagedBlock(filter, state.page, POSTS_PAGE_SIZE);
    return { view, state: { ...state, page: results.page }, results };
  }
  if (view === 'news') {
    const news = await pagedBlock({ kind: 'news' }, state.page, POSTS_PAGE_SIZE);
    return { view, state: { ...state, page: news.page }, news };
  }
  const [articles, news] = await Promise.all([
    pagedBlock({ kind: 'article' }, state.page, POSTS_PAGE_SIZE),
    pagedBlock({ kind: 'news' }, 1, NEWS_PREVIEW),
  ]);
  return { view, state: { ...state, page: articles.page }, articles, news };
});

async function loadPosts(searchParams: SearchParams) {
  const [site, categories, sp] = await Promise.all([getSiteData(), listCategories(), searchParams]);
  if (!isSectionEnabled('consejos', site.sections)) notFound();
  const label = site.sections.find((s) => s.key === 'consejos')?.label ?? 'Consejos de salud';
  const requested = parsePostsQuery(sp, categories.map((c) => c.key));
  return { site, label, categories, aviso: sp.aviso, ...(await listing(JSON.stringify(requested))) };
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { site, label, state, view } = await loadPosts(searchParams);
  const criteria = hasPostsCriteria(state);
  const canonical = criteria || state.page === 1 ? POSTS_PATH : buildPostsHref(state);
  return {
    title: view === 'news' ? `Noticias · ${label}` : label,
    description: `${label} de ${site.clinic.name}: artículos para cuidar a tus animales y noticias de la clínica.`,
    alternates: { canonical },
    // Las variantes filtradas o con búsqueda no se indexan (E5), pero sus enlaces sí se siguen.
    ...(criteria ? { robots: { index: false, follow: true } } : {}),
  };
}

const EMPTY_TEXT: Record<PostKind, string> = {
  article: 'Todavía no hay artículos publicados. Vuelve pronto.',
  news: 'Todavía no hay noticias publicadas. Vuelve pronto.',
};

function PostGrid({ items, showKind = false, priority = false }: { items: PostSummary[]; showKind?: boolean; priority?: boolean }) {
  return (
    <ul className="articles">
      {items.map((p, i) => (
        <li key={p.id}>
          <ArticleCard post={p} showKind={showKind} priority={priority && i < 3} />
        </li>
      ))}
    </ul>
  );
}

function EmptyBlock({ kind }: { kind: PostKind }) {
  return (
    <div className="empty-state">
      <p>{EMPTY_TEXT[kind]}</p>
    </div>
  );
}

const resultsLabel = (n: number) => (n === 1 ? '1 resultado' : `${n} resultados`);

// Listado de consejos (US1 y US3, contracts/routes.md). Sin JavaScript: enlaces y un formulario GET.
export default async function PostsPage({ searchParams }: { searchParams: SearchParams }) {
  const data = await loadPosts(searchParams);
  const { site, label, categories, state, aviso } = data;
  const categoryLabel = categories.find((c) => c.key === state.category)?.label;
  // El texto buscado se pinta como texto (React lo escapa) y nunca se registra en un log.
  const criteriaText = [state.q ? `«${state.q}»` : null, categoryLabel ? `en ${categoryLabel}` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <section className="photo-hero">
        {site.clinic.heroImagePath ? (
          <Image src={site.clinic.heroImagePath} alt="" width={1600} height={700} sizes="100vw" priority />
        ) : null}
        <div className="photo-hero__card">
          <h1>{label}</h1>
          <PostsSearch state={state} />
        </div>
      </section>

      <TopicTabs categories={categories} state={state} />

      <section className="section" id="resultados" aria-labelledby="resultados-titulo" tabIndex={-1}>
        <div className="container">
          {data.view === 'results' ? (
            <>
              <h2 id="resultados-titulo">
                {data.results.total > 0 ? `${resultsLabel(data.results.total)} ${criteriaText}` : 'Sin resultados'}
              </h2>
              {data.results.total > 0 ? (
                <PostGrid items={data.results.items} showKind priority />
              ) : (
                <div className="empty-state" role="status">
                  <p>
                    {state.q ? `No hay resultados para «${state.q}»` : 'No hay publicaciones'}
                    {categoryLabel ? ` en ${categoryLabel}` : ''}. Prueba con otras palabras o mira todos los consejos.
                  </p>
                  <a className="btn" href={POSTS_PATH}>
                    Quitar filtros
                  </a>
                </div>
              )}
              <Pagination
                current={data.results.page}
                pages={data.results.pages}
                hrefFor={(page) => `${buildPostsHref(state, { page })}#resultados`}
              />
            </>
          ) : data.view === 'news' ? (
            <>
              <h2 id="resultados-titulo">Noticias</h2>
              {data.news.total > 0 ? <PostGrid items={data.news.items} priority /> : <EmptyBlock kind="news" />}
              <Pagination current={data.news.page} pages={data.news.pages} hrefFor={(page) => buildPostsHref(state, { page })} />
              <p className="posts-more">
                <a className="link-underline" href={POSTS_PATH}>
                  Volver a todos los consejos
                </a>
              </p>
            </>
          ) : (
            <>
              <h2 id="resultados-titulo">Artículos</h2>
              {data.articles.total > 0 ? <PostGrid items={data.articles.items} priority /> : <EmptyBlock kind="article" />}
              <Pagination
                current={data.articles.page}
                pages={data.articles.pages}
                hrefFor={(page) => `${buildPostsHref(state, { page })}#resultados`}
              />

              <h2 className="posts-block-title" id="noticias">
                Noticias
              </h2>
              {data.news.total > 0 ? (
                <>
                  <PostGrid items={data.news.items} />
                  <p className="posts-more">
                    <a className="btn" href={buildPostsHref(state, { news: true, page: 1 })}>
                      Ver todas las noticias
                    </a>
                  </p>
                </>
              ) : (
                <EmptyBlock kind="news" />
              )}
            </>
          )}
        </div>
      </section>

      <NewsletterBlock returnTo={buildPostsHref(state)} aviso={aviso} />
    </>
  );
}
