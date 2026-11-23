import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ContentValidationError } from '@/content/load';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { postFixture, seedPosts } from './helpers/posts';

// Carga de post_categories, posts y newsletter (contracts/content-file.md).

describe('carga de consejos y boletín', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('carga las categorías, las publicaciones y el boletín de la demo', async () => {
    const summary = await seedPosts();
    expect(summary).toMatchObject({ posts: 12, postsHidden: 0, postCategories: 3, newsletterEnabled: true });
    const cats = await q('SELECT key FROM post_categories ORDER BY sort_order');
    expect(cats.map((c) => c.key)).toEqual(['perro', 'gato', 'otros-animales']);
    const [kinds] = await q(
      `SELECT count(*) FILTER (WHERE kind = 'article')::int AS articles, count(*) FILTER (WHERE kind = 'news')::int AS news FROM posts`,
    );
    expect(kinds).toEqual({ articles: 8, news: 4 });
    expect(await q('SELECT enabled FROM newsletter_settings')).toEqual([{ enabled: true }]);
  });

  it('guarda la fecha a las 00:00 de Madrid y la imagen con barra inicial', async () => {
    await seedPosts((c) => {
      c.posts = [postFixture({ published_on: '2026-07-01', image: 'media/petcare/consejos/bano-perro.svg', image_alt: 'Un perro' })];
    });
    const [row] = await q(`SELECT published_at, image FROM posts`);
    expect((row!.published_at as Date).toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(row!.image).toBe('/media/petcare/consejos/bano-perro.svg');
  });

  it('la recarga es idempotente', async () => {
    await seedPosts();
    const before = await q('SELECT id, slug FROM posts ORDER BY slug');
    await seedPosts();
    expect(await q('SELECT id, slug FROM posts ORDER BY slug')).toEqual(before);
  });

  it('despublica un slug que desaparece del archivo', async () => {
    await seedPosts((c) => {
      c.posts = [postFixture(), postFixture({ slug: 'otra' })];
    });
    const summary = await seedPosts((c) => {
      c.posts = [postFixture()];
    });
    expect(summary.postsHidden).toBe(1);
    expect(await q(`SELECT published FROM posts WHERE slug = 'otra'`)).toEqual([{ published: false }]);
  });

  it('borra una categoría ausente sin publicaciones', async () => {
    await seedPosts((c) => {
      c.posts = [postFixture()];
    });
    await seedPosts((c) => {
      c.post_categories = c.post_categories.filter((x: { key: string }) => x.key !== 'gato');
      c.posts = [postFixture()];
    });
    expect((await q('SELECT key FROM post_categories')).map((r) => r.key)).not.toContain('gato');
  });

  it('falla con el slug si la categoría ausente tiene publicaciones', async () => {
    await seedPosts((c) => {
      c.posts = [postFixture({ slug: 'de-gatos', category: 'gato' })];
    });
    const err = await seedPosts((c) => {
      c.post_categories = c.post_categories.filter((x: { key: string }) => x.key !== 'gato');
      c.posts = [];
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContentValidationError);
    expect((err as ContentValidationError).issues[0]!.message).toContain('de-gatos');
    expect((await q('SELECT key FROM post_categories')).map((r) => r.key)).toContain('gato');
  });

  it('calcula search_text sin tildes ni marcas', async () => {
    await seedPosts((c) => {
      c.posts = [postFixture({ title: 'Baño del PERRO', lead: 'Cuándo bañarlo.', body_md: '## Champú **suave**' })];
    });
    const [row] = await q('SELECT search_text FROM posts');
    expect(row!.search_text).toBe('bano del perro cuando banarlo. champu suave');
  });

  it('sin bloque newsletter el boletín queda desactivado', async () => {
    await seedPosts();
    await seedPosts((c) => {
      delete c.newsletter;
    });
    expect(await q('SELECT enabled FROM newsletter_settings')).toEqual([{ enabled: false }]);
  });
});
