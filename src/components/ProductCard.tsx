import type { ProductSummary } from '@/db/queries/catalog';
import { AddToCartForm } from './AddToCartForm';
import { Price, ProductTags } from './Price';
import { ProductImage } from './ProductImage';

export { PLACEHOLDER_ALT, PRODUCT_PLACEHOLDER } from './ProductImage';

/** "Alimentación · Perro, Gato" */
export const productMeta = (p: Pick<ProductSummary, 'categoryName' | 'pets'>) => `${p.categoryName} · ${p.pets.join(', ')}`;

interface Props {
  product: ProductSummary;
  priority?: boolean;
  /** Con la compra activa: ruta a la que vuelve "Añadir" (conserva filtros, búsqueda y página). */
  returnTo?: string | null;
}

// Tarjeta del catálogo (FR-005, FR-001 de la 005): un article con el enlace a la ficha en el título,
// extendido a toda la tarjeta (.product__link), y "Añadir" encima si hay stock y la compra está activa.
export function ProductCard({ product, priority = false, returnTo = null }: Props) {
  return (
    <article className="product">
      <div className="product__img">
        <ProductImage
          imagePath={product.imagePath}
          imageAlt={product.imageAlt}
          imageWidth={product.imageWidth}
          imageHeight={product.imageHeight}
          sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 25vw"
          priority={priority}
        />
        <ProductTags isNew={product.isNew} priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
      </div>
      <div className="product__body">
        <span className="product__meta">{productMeta(product)}</span>
        <h3>
          <a className="product__link" href={`/productos/${product.slug}`}>
            {product.name}
          </a>
        </h3>
        <div className="product__foot">
          <Price priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
          {product.stock <= 0 ? (
            <span className="badge badge--muted">Agotado</span>
          ) : returnTo ? (
            <AddToCartForm productId={product.id} productName={product.name} returnTo={returnTo} variant="list" />
          ) : null}
        </div>
      </div>
    </article>
  );
}
