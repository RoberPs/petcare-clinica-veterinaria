import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { countPosts, listPosts, postsRouteExists, type PostsFilter } from '@/db/queries/posts';
import { clampPage } from '@/domain/catalog';
import { searchWords } from '@/domain/search';
import { setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { postFixture, seedPosts } from './helpers/posts';

// Lecturas del listado de consejos (E4, E5 y la visibilidad de data-model.md).

const day = (n: number) => `2026-0${1 + Math.floor((n - 1) / 28)}-${String(((n - 1) % 28) + 1).padStart(2, '0')}`;

/** 15 artículos (perro/gato alternos) y 5 noticias, una sin categoría, una despublicada y una futura. */
function demoPosts() {
  const articles = Array.from({ length: 15 }, (_, i) =>
    postFixture({
      slug: `articulo-${i + 1}`,
      category: i % 2 === 0 ? 'perro' : 'gato',
      title: `Artículo número ${i + 1}`,
      published_on: day(i + 1),
    }),
  );
  const news = [
    postFixture({ slug: 'noticia-1', kind: 'news', category: 'gato', title: 'Noticia felina', published_on: '2026-03-01' }),
    postFixture({ slug: 'noticia-2', kind: 'news', category: undefined, title: 'Horario de verano', published_on: '2026-03-02' }),
    postFixture({ slug: 'noticia-3', kind: 'news', category: 'perro', title: 'Campaña de vacunas', published_on: '2026-03-03' }),
    postFixture({ slug: 'noticia-oculta', kind: 'news', category: 'perro', title: 'Oculta', published_on: '2026-03-04', published: false }),
    postFixture({ slug: 'noticia-futura', kind: 'news', category: 'perro', title: 'Futura', published_on: '2099-01-01' }),
  ];
  const special = [
    postFixture({
      slug: 'bano-del-perro',
      category: 'perro',
      title: 'Cada cuánto bañar al perro',
      lead: 'Un baño a tiempo evita problemas de piel.',
      body_md: '## Champú\nUsa siempre un champú suave y específico.',
      published_on: '2026-02-20',
    }),
  ];
  return [...articles, ...news, ...special];
}

const slugs = async (filter: PostsFilter, page = 1, pageSize = 12) =>
  (await listPosts({ ...filter, page, pageSize })).map((p) => p.slug);

describe('listado de consejos', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedPosts((c) => {
      c.posts = demoPosts();
    });
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('cuenta por tipo sin las despublicadas ni las de fecha futura', async () => {
    expect(await countPosts({ kind: 'article' })).toBe(16);
    expect(await countPosts({ kind: 'news' })).toBe(3);
    expect(await countPosts({})).toBe(19);
  });

  it('ordena por fecha de publicación descendente', async () => {
    expect(await slugs({ kind: 'news' })).toEqual(['noticia-3', 'noticia-2', 'noticia-1']);
    const first = await listPosts({ kind: 'article', page: 1, pageSize: 3 });
    expect(first.map((p) => p.slug)).toEqual(['bano-del-perro', 'articulo-15', 'articulo-14']);
  });

  it('pagina de 12 en 12 y acota una página fuera de rango', async () => {
    expect(await slugs({ kind: 'article' }, 1)).toHaveLength(12);
    expect(await slugs({ kind: 'article' }, 2)).toHaveLength(4);
    const total = await countPosts({ kind: 'article' });
    expect(clampPage(9, total, 12)).toBe(2);
    expect(clampPage(0, total, 12)).toBe(1);
  });

  it('devuelve la etiqueta de la categoría o null en la noticia general', async () => {
    const [news] = await listPosts({ kind: 'news', page: 1, pageSize: 3 }).then((r) => r.filter((p) => p.slug === 'noticia-2'));
    expect(news).toMatchObject({ categoryKey: null, categoryLabel: null });
    const [cat] = await listPosts({ kind: 'news', page: 1, pageSize: 1 });
    expect(cat).toMatchObject({ categoryKey: 'perro', categoryLabel: 'Perro' });
  });

  it('filtra por categoría y excluye las noticias sin categoría', async () => {
    const gato = await slugs({ categoryKey: 'gato' }, 1, 50);
    expect(gato).toContain('noticia-1');
    expect(gato).not.toContain('noticia-2');
    expect(gato).toHaveLength(8);
  });

  it('busca palabras sin tildes en título, preámbulo y cuerpo', async () => {
    expect(await slugs({ words: searchWords('BANO') })).toEqual(['bano-del-perro']);
    expect(await slugs({ words: searchWords('piel') })).toEqual(['bano-del-perro']);
    expect(await slugs({ words: searchWords('champú') })).toEqual(['bano-del-perro']);
  });

  it('exige todas las palabras y se combina con la categoría', async () => {
    expect(await slugs({ words: searchWords('champú suave') })).toEqual(['bano-del-perro']);
    expect(await slugs({ words: searchWords('champú gatos') })).toEqual([]);
    expect(await slugs({ categoryKey: 'gato', words: searchWords('baño') })).toEqual([]);
    expect(await slugs({ categoryKey: 'perro', words: searchWords('baño') })).toEqual(['bano-del-perro']);
  });

  it('sin resultados y con comodines tratados como texto', async () => {
    expect(await countPosts({ words: searchWords('zzzz') })).toBe(0);
    expect(await countPosts({ words: searchWords('%') })).toBe(0);
    expect(await countPosts({ words: searchWords('_') })).toBe(0);
  });

  it('postsRouteExists: sección activa, publicación visible o no', async () => {
    expect(await postsRouteExists(null)).toBe(true);
    expect(await postsRouteExists('bano-del-perro')).toBe(true);
    expect(await postsRouteExists('noticia-futura')).toBe(false);
    expect(await postsRouteExists('noticia-oculta')).toBe(false);
    expect(await postsRouteExists('no-existe')).toBe(false);
  });
});
