import Image from 'next/image';
import type { PostSummary } from '@/db/queries/posts';

export const ARTICLE_PLACEHOLDER = '/media/comun/placeholder-articulo.svg';
export const GENERAL_LABEL = 'General';
export const KIND_LABEL = { article: 'Artículo', news: 'Noticia' } as const;

interface Props {
  post: PostSummary;
  /** En la lista combinada (filtro o búsqueda) se indica si es artículo o noticia. */
  showKind?: boolean;
  priority?: boolean;
}

// Tarjeta de una publicación (FR-002): imagen o marcador decorativo, categoría o "General" y el
// título enlazado; el enlace se extiende a toda la tarjeta (.article-card__link).
export function ArticleCard({ post, showKind = false, priority = false }: Props) {
  return (
    <article className="article-card">
      <div className="article-card__img">
        <Image
          src={post.image ?? ARTICLE_PLACEHOLDER}
          alt={post.image ? (post.imageAlt ?? '') : ''}
          width={640}
          height={360}
          sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw"
          {...(priority ? { priority: true } : { loading: 'lazy' as const })}
        />
      </div>
      <div className="article-card__body">
        <div className="article-card__tags">
          <span className="chip">{post.categoryLabel ?? GENERAL_LABEL}</span>
          {showKind ? <span className="badge badge--muted">{KIND_LABEL[post.kind]}</span> : null}
        </div>
        <h3>
          <a className="article-card__link" href={`/consejos/${post.slug}`}>
            {post.title}
          </a>
        </h3>
      </div>
    </article>
  );
}
