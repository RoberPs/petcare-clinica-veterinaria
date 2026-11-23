import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Markdown } from '@/components/Markdown';
import { Price, ProductTags } from '@/components/Price';
import { PLACEHOLDER_ALT, PRODUCT_PLACEHOLDER, ProductCard, productMeta } from '@/components/ProductCard';
import { ShopNotice } from '@/components/ShopNotice';
import { availability, pickTab, productTabs } from '@/domain/catalog';
import { isSectionEnabled } from '@/domain/sections';
import { getProductBySlug, getShopSettings, relatedProducts } from '@/db/queries/catalog';
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

// Ficha de producto (US2, contracts/routes.md): sin compra; las pestañas son enlaces (C7).
export default async function ProductPage({ params, searchParams }: Props) {
  const found = await loadProduct((await params).slug);
  if (!found) notFound();
  const sp = await searchParams;
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
            <Image
              src={product.imagePath ?? PRODUCT_PLACEHOLDER}
              alt={product.imagePath ? (product.imageAlt ?? '') : PLACEHOLDER_ALT}
              width={600}
              height={600}
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
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
