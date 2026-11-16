import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Breadcrumb } from '@/components/Breadcrumb';
import { CatalogFilters } from '@/components/CatalogFilters';
import { Notice } from '@/components/Notice';
import { Pagination } from '@/components/Pagination';
import { ProductCard } from '@/components/ProductCard';
import { ShopNotice } from '@/components/ShopNotice';
import {
  clampPage,
  hasFilters,
  parseCatalogQuery,
  totalPages,
  type CatalogState,
  type QueryParams,
} from '@/domain/catalog';
import { isSectionEnabled } from '@/domain/sections';
import { countProducts, getCatalogFilters, getShopSettings, listProducts } from '@/db/queries/catalog';
import { getSiteData } from '@/db/queries/site';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<QueryParams>;

/** Total y página del listado; se comparte entre la página y generateMetadata. */
const listing = cache(async (key: string, pageSize: number) => {
  const requested = JSON.parse(key) as CatalogState;
  const filter = { pets: requested.pets, category: requested.category, q: requested.q, sort: requested.sort };
  const total = await countProducts(filter);
  const state: CatalogState = { ...requested, page: clampPage(requested.page, total, pageSize) };
  const [items, catalogTotal] = await Promise.all([
    total > 0 ? listProducts({ ...filter, page: state.page, pageSize }) : Promise.resolve([]),
    hasFilters(requested) && total === 0 ? countProducts({}) : Promise.resolve(total),
  ]);
  return { state, total, items, pages: totalPages(total, pageSize), catalogEmpty: catalogTotal === 0 };
});

async function loadCatalog(searchParams: SearchParams) {
  const [site, settings, filters, sp] = await Promise.all([
    getSiteData(),
    getShopSettings(),
    getCatalogFilters(),
    searchParams,
  ]);
  if (!isSectionEnabled('tienda', site.sections) || !settings) notFound();
  // Con la compra activa, "Añadir" vuelve al mismo listado (filtros, búsqueda y página) sin el aviso.
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'aviso' || v === undefined) continue;
    for (const value of Array.isArray(v) ? v : [v]) query.append(k, value);
  }
  const returnTo = isSectionEnabled('carrito', site.sections) ? `/productos${query.size > 0 ? `?${query}` : ''}` : null;
  const aviso = sp.aviso;
  const requested = parseCatalogQuery(sp, {
    pets: filters.pets.map((p) => p.slug),
    categories: filters.categories.map((c) => c.slug),
  });
  return { settings, filters, returnTo, aviso, ...(await listing(JSON.stringify(requested), settings.pageSize)) };
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { settings, state } = await loadCatalog(searchParams);
  return {
    title: 'Nuestros productos',
    description: settings.metaDescription,
    alternates: { canonical: state.page > 1 ? `/productos?pagina=${state.page}` : '/productos' },
    // Las variantes filtradas no se indexan (C14), pero sus enlaces sí se siguen.
    ...(hasFilters(state) ? { robots: { index: false, follow: true } } : {}),
  };
}

const countLabel = (n: number) => (n === 1 ? '1 producto' : `${n} productos`);

// Listado del catálogo (US1, contracts/routes.md). Sin JavaScript: todo son enlaces y un formulario GET.
export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const { settings, filters, state, total, items, pages, catalogEmpty, returnTo, aviso } = await loadCatalog(searchParams);
  // El término se pinta como texto (React lo escapa) y no se registra en ningún log.
  const forTerm = state.q ? ` para «${state.q}»` : '';
  const heading =
    (total > 0 || catalogEmpty ? countLabel(total) : 'No hay productos que coincidan') + forTerm;

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <Breadcrumb current="Nuestros productos" />
          <h1>Nuestros productos</h1>
          <ShopNotice settings={settings} />
        </div>
      </section>
      <div className="container">
        <Notice code={aviso} />
      </div>

      <div className="container">
        <div className="shop-layout">
          <CatalogFilters filters={filters} state={state} />
          <section className="shop-results" aria-labelledby="resultados">
            <div className="shop-toolbar">
              <h2 id="resultados" tabIndex={-1}>
                {heading}
              </h2>
            </div>

            {items.length > 0 ? (
              <ul className="product-grid">
                {items.map((p, i) => (
                  <li key={p.id}>
                    <ProductCard product={p} priority={i < 4} returnTo={returnTo} />
                  </li>
                ))}
              </ul>
            ) : catalogEmpty ? (
              <div className="empty-state">
                <p>Todavía no hay productos en la tienda.</p>
                <div className="band__actions">
                  <Link prefetch={false} className="btn" href="/">
                    Volver al inicio
                  </Link>
                  <Link prefetch={false} className="btn btn--pink" href="/contacto">
                    Contactar con la clínica
                  </Link>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>
                  {state.q
                    ? `No hemos encontrado productos para «${state.q}». Revisa la palabra o prueba con otra más general.`
                    : 'Prueba con otros filtros o consulta todo el catálogo.'}
                </p>
                <Link prefetch={false} className="btn" href="/productos">
                  Ver todo el catálogo
                </Link>
              </div>
            )}

            <Pagination state={state} pages={pages} />
          </section>
        </div>
      </div>
    </>
  );
}
