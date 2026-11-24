import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { ProductForm } from '@/components/admin/ProductForm';
import { getProductAdmin, listCategoriesAndPetsAdmin } from '@/db/queries/admin-products';
import { uuid } from '@/domain/store-schemas';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { saveProduct, setProductPublished } from '../actions';

export const metadata: Metadata = { title: 'Editar producto' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Edición de un producto (US1, escenarios 3 a 5): el slug no cambia; Desactivar y Reactivar son
// formularios propios, fuera del formulario de edición.
export default async function AdminEditProductPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  if (!uuid.safeParse(id).success) notFound();
  const [product, { categories, pets }] = await Promise.all([getProductAdmin(id), listCategoriesAndPetsAdmin()]);
  if (!product) notFound();
  const token = createSubmissionToken(now);
  return (
    <>
      <div className="admin-heading">
        <h2>Editar producto: {product.name}</h2>
        <span className={product.published ? 'badge' : 'badge badge--muted'}>{product.published ? 'Publicado' : 'Desactivado'}</span>
      </div>
      <AdminNotice searchParams={sp} context="product" />
      <p>
        Dirección en la tienda: <code>/productos/{product.slug}</code>
        {product.published ? (
          <>
            {' '}
            (
            <Link prefetch={false} href={`/productos/${product.slug}`}>
              ver la ficha
            </Link>
            )
          </>
        ) : null}
        . No cambia aunque cambies el nombre.
      </p>
      <ProductForm
        action={saveProduct}
        submissionToken={token}
        categories={categories}
        pets={pets}
        initial={{
          id: product.id,
          name: product.name,
          shortDescription: product.shortDescription,
          descriptionMd: product.descriptionMd,
          ingredientsMd: product.ingredientsMd,
          usageMd: product.usageMd,
          categoryId: product.categoryId,
          petIds: product.petIds,
          priceCents: product.priceCents,
          compareAtCents: product.compareAtCents,
          vatRate: product.vatRate,
          stock: product.stock,
          isNew: product.isNew,
          published: product.published,
          position: product.position,
          imagePath: product.imagePath,
          imageAlt: product.imageAlt,
          imageWidth: product.imageWidth,
          imageHeight: product.imageHeight,
        }}
      />
      <section className="panel admin-section" aria-labelledby="publicacion">
        <h3 id="publicacion">{product.published ? 'Desactivar el producto' : 'Reactivar el producto'}</h3>
        <p>
          {product.published
            ? 'Deja de verse en el catálogo y ya no se puede comprar. Los pedidos que ya lo incluyen no cambian.'
            : 'Vuelve a verse en el catálogo y se puede comprar de nuevo.'}
        </p>
        <form action={setProductPublished}>
          <input type="hidden" name="submission" value={token} />
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="published" value={product.published ? '0' : '1'} />
          <button className={product.published ? 'btn btn--ghost' : 'btn'} type="submit">
            {product.published ? 'Desactivar' : 'Reactivar'}
          </button>
        </form>
      </section>
    </>
  );
}
