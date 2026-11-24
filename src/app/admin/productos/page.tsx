import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { Pagination } from '@/components/Pagination';
import { ProductImage } from '@/components/ProductImage';
import { ADMIN_PAGE_SIZE, listCategoriesAndPetsAdmin, listProductsAdmin, type ProductStateFilter } from '@/db/queries/admin-products';
import { formatEur } from '@/domain/money';
import { uuid } from '@/domain/store-schemas';
import { requireAdmin } from '@/lib/auth/require-admin';

export const metadata: Metadata = { title: 'Productos' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const idParam = (v: string | undefined) => (v && uuid.safeParse(v).success ? v : null);

// Productos de la tienda (US1, FR-009): lista paginada con filtros por GET (funciona sin JavaScript).
export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (first(sp.q) ?? '').trim().slice(0, 80);
  const categoryId = idParam(first(sp.categoria));
  const petId = idParam(first(sp.mascota));
  const stateRaw = first(sp.estado);
  const state: ProductStateFilter | null = stateRaw === 'publicado' || stateRaw === 'desactivado' ? stateRaw : null;
  const pageRaw = Number(first(sp.pagina) ?? 1);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const [{ rows, total }, { categories, pets }] = await Promise.all([
    listProductsAdmin({ q, categoryId, petId, state, page }),
    listCategoriesAndPetsAdmin(),
  ]);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const hrefFor = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (categoryId) p.set('categoria', categoryId);
    if (petId) p.set('mascota', petId);
    if (state) p.set('estado', state);
    if (n > 1) p.set('pagina', String(n));
    const s = p.toString();
    return s ? `/admin/productos?${s}` : '/admin/productos';
  };
  const filtered = Boolean(q || categoryId || petId || state);

  return (
    <>
      <div className="admin-heading">
        <h2>Productos</h2>
        <Link prefetch={false} className="btn" href="/admin/productos/nuevo">
          Nuevo producto
        </Link>
      </div>
      <AdminNotice searchParams={sp} context="product" />
      <form className="admin-search" method="get" action="/admin/productos" role="search" aria-label="Filtrar productos">
        <div className="field">
          <label htmlFor="filtro-q">Nombre</label>
          <input id="filtro-q" type="search" name="q" defaultValue={q} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="filtro-categoria">Categoría</label>
          <select id="filtro-categoria" name="categoria" defaultValue={categoryId ?? ''}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.published ? '' : ' (oculta)'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filtro-mascota">Mascota</label>
          <select id="filtro-mascota" name="mascota" defaultValue={petId ?? ''}>
            <option value="">Todas</option>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.published ? '' : ' (oculta)'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filtro-estado">Estado</label>
          <select id="filtro-estado" name="estado" defaultValue={state ?? ''}>
            <option value="">Todos</option>
            <option value="publicado">Publicado</option>
            <option value="desactivado">Desactivado</option>
          </select>
        </div>
        <button className="btn" type="submit">
          Filtrar
        </button>
        {filtered ? (
          <Link prefetch={false} className="btn btn--ghost" href="/admin/productos">
            Quitar filtros
          </Link>
        ) : null}
      </form>

      <p aria-live="polite">
        {total} {total === 1 ? 'producto' : 'productos'}
      </p>
      {rows.length === 0 ? (
        <p>{filtered ? 'Ningún producto cumple estos filtros.' : 'Aún no hay productos.'}</p>
      ) : (
        <table className="orders orders--stack" role="table">
          <caption className="visually-hidden">Productos de la tienda</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                <span className="visually-hidden">Foto</span>
              </th>
              <th scope="col" role="columnheader">Producto</th>
              <th scope="col" role="columnheader">Categoría</th>
              <th scope="col" role="columnheader">Precio</th>
              <th scope="col" role="columnheader">Disponible</th>
              <th scope="col" role="columnheader">Reservado</th>
              <th scope="col" role="columnheader">Estado</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((p) => (
              <tr key={p.id} role="row">
                <td role="cell" data-label="Foto">
                  <ProductImage imagePath={p.imagePath} imageAlt="" imageWidth={p.imageWidth} imageHeight={p.imageHeight} sizes="72px" fallbackSize={72} className="admin-thumb" />
                </td>
                <td role="cell" data-label="Producto">
                  <Link prefetch={false} href={`/admin/productos/${p.id}`}>
                    {p.name}
                  </Link>
                  {p.isNew ? <span className="badge badge--sky">Novedad</span> : null}
                  {p.compareAtCents ? <span className="badge badge--amber">Oferta</span> : null}
                </td>
                <td role="cell" data-label="Categoría">{p.categoryName}</td>
                <td role="cell" data-label="Precio">{formatEur(p.priceCents)}</td>
                <td role="cell" data-label="Disponible">
                  <Link prefetch={false} href={`/admin/productos/${p.id}/stock`} aria-label={`Stock de ${p.name}: ${p.stock}`}>
                    {p.stock}
                  </Link>
                </td>
                <td role="cell" data-label="Reservado">{p.reserved}</td>
                <td role="cell" data-label="Estado">
                  <span className={p.published ? 'badge' : 'badge badge--muted'}>{p.published ? 'Publicado' : 'Desactivado'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination current={Math.min(page, pages)} pages={pages} hrefFor={hrefFor} />
    </>
  );
}
