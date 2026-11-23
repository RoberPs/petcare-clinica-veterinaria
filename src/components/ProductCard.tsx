import Image from 'next/image';
import type { ProductSummary } from '@/db/queries/catalog';
import { Price, ProductTags } from './Price';

export const PRODUCT_PLACEHOLDER = '/media/comun/placeholder-producto.svg';
export const PLACEHOLDER_ALT = 'Imagen genérica: este producto todavía no tiene foto';

/** "Alimentación · Perro, Gato" */
export const productMeta = (p: Pick<ProductSummary, 'categoryName' | 'pets'>) => `${p.categoryName} · ${p.pets.join(', ')}`;

// Tarjeta del catálogo (FR-005): un enlace a la ficha, sin botones de compra (FR-019).
export function ProductCard({ product, priority = false }: { product: ProductSummary; priority?: boolean }) {
  return (
    <a className="product" href={`/productos/${product.slug}`}>
      <div className="product__img">
        <Image
          src={product.imagePath ?? PRODUCT_PLACEHOLDER}
          alt={product.imagePath ? (product.imageAlt ?? '') : PLACEHOLDER_ALT}
          width={600}
          height={600}
          sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 25vw"
          {...(priority ? { priority: true } : { loading: 'lazy' as const })}
        />
        <ProductTags isNew={product.isNew} priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
      </div>
      <div className="product__body">
        <span className="product__meta">{productMeta(product)}</span>
        <h3>{product.name}</h3>
        <div className="product__foot">
          <Price priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
          {product.stock > 0 ? null : <span className="badge badge--muted">Agotado</span>}
        </div>
      </div>
    </a>
  );
}
