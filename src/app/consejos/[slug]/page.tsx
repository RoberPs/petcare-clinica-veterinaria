import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ArticleBody } from '@/components/ArticleBody';
import { ARTICLE_PLACEHOLDER, GENERAL_LABEL } from '@/components/ArticleCard';
import { Breadcrumb } from '@/components/Breadcrumb';
import { buildPostsHref, POSTS_PATH } from '@/domain/posts-query';
import { sectionHref } from '@/domain/sections';
import { formatLongDate, zonedNow } from '@/domain/time';
import { getVisiblePostBySlug } from '@/db/queries/posts';
import { getSiteData } from '@/db/queries/site';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

const loadPost = cache(async (slug: string) => {
  const [site, post] = await Promise.all([getSiteData(), getVisiblePostBySlug(slug)]);
  // El middleware ya sirve el 404 sin JavaScript; esto cubre el caso en que su consulta falle.
  if (!post) notFound();
  return { site, post };
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { site, post } = await loadPost(slug);
  const image = post.image
    ? { url: post.image, alt: post.imageAlt ?? '' }
    : site.clinic.heroImagePath
      ? { url: site.clinic.heroImagePath, alt: site.clinic.heroImageAlt ?? '' }
      : null;
  return {
    title: post.title,
    description: post.metaDescription,
    alternates: { canonical: `${POSTS_PATH}/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.metaDescription,
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      ...(image ? { images: [image] } : {}),
    },
  };
}

// Detalle de una publicación (US2, contracts/routes.md; maqueta articulo.html).
export default async function PostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const { site, post } = await loadPost(slug);
  const label = site.sections.find((s) => s.key === 'consejos')?.label ?? 'Consejos de salud';
  const day = zonedNow(post.publishedAt).toPlainDate().toString();

  return (
    <>
      <section className="page-hero article-page">
        <div className="container article-hero">
          <div>
            <Breadcrumb current={post.title} trail={[{ href: POSTS_PATH, label }]} />
            <h1>{post.title}</h1>
            <div className="article-meta">
              {post.categoryKey && post.categoryLabel ? (
                <a
                  className="chip"
                  href={buildPostsHref({ category: post.categoryKey, q: '', news: false, page: 1 })}
                >
                  {post.categoryLabel}
                </a>
              ) : (
                <span className="chip">{GENERAL_LABEL}</span>
              )}
              <time dateTime={day}>{formatLongDate(day)}</time>
            </div>
            <p className="preamble">{post.lead}</p>
          </div>
          <div className="article-hero__img">
            <Image
              src={post.image ?? ARTICLE_PLACEHOLDER}
              alt={post.image ? (post.imageAlt ?? '') : ''}
              width={800}
              height={600}
              sizes="(max-width: 900px) 100vw, 45vw"
              priority
            />
          </div>
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          <article className="prose">
            <ArticleBody markdown={post.bodyMd} sections={site.sections} />
            <aside className="cta-box" aria-labelledby="cta-veterinario">
              <h2 id="cta-veterinario" className="h3">
                Ponte en contacto con un veterinario
              </h2>
              <p>Si tienes dudas sobre la salud de tu animal, pide cita y lo vemos en la clínica.</p>
              <a className="btn btn--sky" href={sectionHref('reservas', site.sections)}>
                Pide cita
              </a>
            </aside>
          </article>
        </div>
      </section>
    </>
  );
}
