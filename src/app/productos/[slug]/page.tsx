import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { buyNow } from '@/app/carrito/actions';
import { AddToCartForm } from '@/components/AddToCartForm';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Markdown } from '@/components/Markdown';
import { Notice } from '@/components/Notice';
import { Price, ProductTags } from '@/components/Price';
import { ProductCard, productMeta } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { ShopNotice } from '@/components/ShopNotice';
import { availability, pickTab, productTabs } from '@/domain/catalog';
import { isSectionEnabled } from '@/domain/sections';
import { getProductBySlug, getShopSettings, relatedProducts } from '@/db/queries/catalog';
import { getCheckoutSettings } from '@/db/queries/checkout-config';
import { getSiteData } from '@/db/queries/site';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const loadProduct = cache(async (slug: string) => {
  const [site, settings] = await Promise.all([getSiteData(), getShopSettings()]);
  if (!isSectionEnabled('tienda', site.sections) || !settings) return null;
  const product = await getProductBySlug(slug);
  return product ? { site, settings, product } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await loadProduct((await params).slug);
  if (!found) return { title: 'Producto no encontrado', robots: { index: false } };
  const { product } = found;
  return {
    title: `${product.name} · Nuestros productos`,
    description: product.shortDescription,
    alternates: { canonical: `/productos/${product.slug}` },
    openGraph: product.imagePath
      ? { images: [{ url: product.imagePath, width: 600, height: 600, alt: product.imageAlt ?? '' }] }
      : undefined,
  };
}

// Ficha de producto (US2, contracts/routes.md): las pestañas son enlaces (C7). Con la compra activa
// (feature 005), cantidad y "Añadir al carrito" (sustituye FR-019 de la 004).
export default async function ProductPage({ params, searchParams }: Props) {
  const found = await loadProduct((await params).slug);
  if (!found) notFound();
  const sp = await searchParams;
  // Compra (FR-001 de la 005): con la compra activa y stock, cantidad y "Añadir al carrito".
  const checkout = isSectionEnabled('carrito', found.site.sections) ? await getCheckoutSettings() : null;
  const maxQty = checkout ? Math.min(found.product.stock, checkout.maxQtyPerLine) : 0;
  const aviso = Array.isArray(sp.aviso) ? sp.aviso[0] : sp.aviso;
  // Tras acotar a las unidades disponibles, la ficha dice cuántas quedan (el aviso no lleva datos).
  const stockNotice =
    aviso === 'carrito-ajustado' && found.product.stock <= (checkout?.maxQtyPerLine ?? 0)
      ? found.product.stock === 1
        ? 'Solo queda 1 unidad. Hemos añadido la que hay disponible.'
        : `Solo quedan ${found.product.stock} unidades. Hemos añadido las que hay disponibles.`
      : null;
  const productPath = `/productos/${found.product.slug}`;
  const { site, settings, product } = found;

  const tabs = productTabs(product);
  const requested = Array.isArray(sp.pestana) ? sp.pestana[0] : sp.pestana;
  const active = pickTab(tabs, requested);
  const stock = availability(product.stock, settings.shippingText);
  const related = await relatedProducts(product.id, product.categoryId, product.petIds);

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <Breadcrumb current={product.name} trail={[{ href: '/productos', label: 'Nuestros productos' }]} />
        </div>
      </section>

      <div className="container">
        <div className="detail">
          <div className="detail__gallery">
            <ProductImage
              imagePath={product.imagePath}
              imageAlt={product.imageAlt}
              imageWidth={product.imageWidth}
              imageHeight={product.imageHeight}
              sizes="(max-width: 900px) 100vw, 50vw"
              priority
            />
          </div>
          <div className="detail__info">
            <ProductTags
              isNew={product.isNew}
              priceCents={product.priceCents}
              compareAtCents={product.compareAtCents}
            />
            <span className="chip detail__chip">{productMeta(product)}</span>
            <h1>{product.name}</h1>
            <p className="preamble">{product.shortDescription}</p>
            <Price priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
            <p className="detail__pets">Para: {product.pets.join(', ')}</p>
            <span className={stock.inStock ? 'badge' : 'badge badge--muted'}>{stock.label}</span>
            <ShopNotice settings={settings} />
            {stockNotice ? (
              <div className="form-success notice-status" role="status">
                <p>{stockNotice}</p>
              </div>
            ) : (
              <Notice code={aviso} />
            )}
            {checkout && maxQty > 0 ? (
              <AddToCartForm
                productId={product.id}
                productName={product.name}
                returnTo={productPath}
                variant="detail"
                max={maxQty}
              >
                {/* "Comprar ahora" (US8): el mismo formulario y la misma cantidad, otra acción. */}
                <button type="submit" className="btn btn--ghost" formAction={buyNow}>
                  Comprar ahora
                </button>
              </AddToCartForm>
            ) : null}

            {tabs.length > 1 ? (
              <nav className="tabs" id="pestanas" aria-label="Información del producto">
                {tabs.map((t) => (
                  <Link
                    key={t.id}
                    prefetch={false}
                    scroll={false}
                    href={
                      t.id === 'descripcion'
                        ? `/productos/${product.slug}#pestanas`
                        : `/productos/${product.slug}?pestana=${t.id}#pestanas`
                    }
                    aria-current={t.id === active.id ? 'true' : undefined}
                  >
                    {t.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            <div className="detail__panel">
              <Markdown sections={site.sections}>{active.body}</Markdown>
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="band related" aria-labelledby="relacionados">
          <div className="container">
            <h2 id="relacionados">También te puede interesar</h2>
            <ul className="product-grid">
              {related.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} returnTo={checkout ? productPath : null} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
