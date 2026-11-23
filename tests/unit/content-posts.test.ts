import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { defaultMetaDescription, parseContent } from '@/content/schema';

// Bloques post_categories, posts y newsletter (contracts/content-file.md).
const env = {
  CLINIC_PHONE_E164: '+34600000000',
  CLINIC_PHONE_DISPLAY: '600 00 00 00',
  CLINIC_INBOX_EMAIL: 'buzon@example.test',
  LEGAL_OWNER_NAME: 'Responsable de Pruebas',
  LEGAL_CONTACT_EMAIL: 'derechos@example.test',
};

const petcare = () => parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>;

const article = (over: Record<string, unknown> = {}) => ({
  slug: 'articulo-de-prueba',
  kind: 'article',
  category: 'perro',
  title: 'Título de prueba',
  lead: 'Preámbulo de prueba.',
  published_on: '2026-10-02',
  body_md: '## Sección\nTexto.',
  ...over,
});

function withPosts(posts: unknown[], extra: Record<string, unknown> = {}) {
  const c = petcare();
  c.post_categories = [
    { key: 'perro', label: 'Perro' },
    { key: 'gato', label: 'Gato' },
  ];
  c.posts = posts;
  return Object.assign(c, extra);
}

function issues(content: Record<string, any>) {
  const r = parseContent(content, env);
  return r.ok ? [] : r.issues;
}

const hasIssue = (content: Record<string, any>, path: string, text?: string) =>
  issues(content).some((i) => i.path === path && (!text || i.message.includes(text)));

describe('contenido de consejos y boletín', () => {
  it('el archivo de la demo es válido', () => {
    expect(issues(petcare())).toEqual([]);
  });

  it('acepta un artículo y una noticia sin categoría', () => {
    const r = parseContent(withPosts([article(), article({ slug: 'noticia', kind: 'news', category: null })]), env);
    expect(r.ok).toBe(true);
  });

  it('exige la categoría en los artículos', () => {
    expect(hasIssue(withPosts([article({ category: null })]), 'posts[0].category', 'obligatoria')).toBe(true);
  });

  it('exige que la categoría exista', () => {
    expect(hasIssue(withPosts([article({ category: 'pez' })]), 'posts[0].category', 'no existe la categoría')).toBe(true);
  });

  it('rechaza slugs repetidos', () => {
    expect(hasIssue(withPosts([article(), article()]), 'posts[1]', 'slug repetido')).toBe(true);
  });

  it('rechaza claves de categoría repetidas', () => {
    const c = withPosts([]);
    c.post_categories.push({ key: 'perro', label: 'Otra' });
    expect(hasIssue(c, 'post_categories[2]', 'key repetido')).toBe(true);
  });

  it('exige image_alt si hay imagen', () => {
    const c = withPosts([article({ image: 'media/petcare/consejos/x.svg' })]);
    expect(hasIssue(c, 'posts[0].image_alt')).toBe(true);
  });

  it('rechaza un encabezado # de nivel 1 en el cuerpo', () => {
    expect(hasIssue(withPosts([article({ body_md: '# Título\nTexto' })]), 'posts[0].body_md', 'nivel 1')).toBe(true);
  });

  it('rechaza un cuerpo de más de 40 000 caracteres', () => {
    expect(hasIssue(withPosts([article({ body_md: 'a'.repeat(40_001) })]), 'posts[0].body_md')).toBe(true);
  });

  it('toma la meta descripción del preámbulo si falta', () => {
    const r = parseContent(withPosts([article({ lead: 'x '.repeat(200) })]), env);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.posts[0]!.meta_description.length).toBeLessThanOrEqual(160);
  });

  it('newsletter es opcional', () => {
    const c = withPosts([]);
    delete c.newsletter;
    c.legal_pages = c.legal_pages.filter((p: { kind: string }) => p.kind !== 'boletin');
    expect(issues(c)).toEqual([]);
  });

  it('exige la página legal boletin si el boletín está activo', () => {
    const c = withPosts([], { newsletter: { enabled: true, title: 'Boletín', text: 'Texto' } });
    c.legal_pages = c.legal_pages.filter((p: { kind: string }) => p.kind !== 'boletin');
    expect(hasIssue(c, 'legal_pages', '"boletin"')).toBe(true);
  });

  it('exige post_categories si la sección de consejos está activa', () => {
    const c = withPosts([]);
    c.post_categories = [];
    expect(hasIssue(c, 'post_categories')).toBe(true);
  });
});

describe('defaultMetaDescription', () => {
  it('deja intacto un preámbulo corto', () => {
    expect(defaultMetaDescription('Corto.')).toBe('Corto.');
  });

  it('recorta a 160 caracteres como mucho', () => {
    expect(defaultMetaDescription('palabra '.repeat(40)).length).toBeLessThanOrEqual(160);
  });
});
