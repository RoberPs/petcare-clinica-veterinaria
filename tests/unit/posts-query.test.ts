import { describe, expect, it } from 'vitest';
import { buildPostsHref, parsePostsQuery, postsView, type PostsState } from '@/domain/posts-query';

const known = ['perro', 'gato', 'otros-animales'];
const parse = (params: Record<string, string | string[] | undefined>) => parsePostsQuery(params, known);
const base: PostsState = { category: null, q: '', news: false, page: 1 };

describe('parsePostsQuery', () => {
  it('sin parámetros devuelve los valores por defecto', () => {
    expect(parse({})).toEqual(base);
  });

  it('acepta una categoría conocida e ignora una desconocida', () => {
    expect(parse({ categoria: 'gato' }).category).toBe('gato');
    expect(parse({ categoria: 'dragon' }).category).toBeNull();
    expect(parse({ categoria: ['perro', 'gato'] }).category).toBe('perro');
  });

  it('q vacío o con solo espacios equivale a no buscar', () => {
    expect(parse({ q: '' }).q).toBe('');
    expect(parse({ q: '    ' }).q).toBe('');
    expect(parse({ q: '  baño  ' }).q).toBe('baño');
  });

  it('recorta la búsqueda a 100 caracteres', () => {
    expect(parse({ q: 'a'.repeat(150) }).q).toHaveLength(100);
  });

  it('solo reconoce tipo=noticias y lo ignora con filtro o búsqueda', () => {
    expect(parse({ tipo: 'noticias' }).news).toBe(true);
    expect(parse({ tipo: 'articulos' }).news).toBe(false);
    expect(parse({ tipo: 'noticias', q: 'gato' }).news).toBe(false);
    expect(parse({ tipo: 'noticias', categoria: 'gato' }).news).toBe(false);
  });

  it('la página es un entero ≥ 1', () => {
    expect(parse({ pagina: '3' }).page).toBe(3);
    expect(parse({ pagina: '0' }).page).toBe(1);
    expect(parse({ pagina: '-2' }).page).toBe(1);
    expect(parse({ pagina: 'abc' }).page).toBe(1);
    expect(parse({ pagina: '1.5' }).page).toBe(1);
  });
});

describe('postsView', () => {
  it('distingue las tres vistas', () => {
    expect(postsView(base)).toBe('default');
    expect(postsView({ ...base, news: true })).toBe('news');
    expect(postsView({ ...base, q: 'baño' })).toBe('results');
    expect(postsView({ ...base, category: 'perro' })).toBe('results');
  });
});

describe('buildPostsHref', () => {
  it('omite la página 1 y los valores vacíos', () => {
    expect(buildPostsHref(base)).toBe('/consejos');
    expect(buildPostsHref(base, { page: 2 })).toBe('/consejos?pagina=2');
  });

  it('conserva filtro y búsqueda al paginar', () => {
    const s = { ...base, category: 'gato', q: 'arena limpia' };
    expect(buildPostsHref(s, { page: 2 })).toBe('/consejos?categoria=gato&q=arena%20limpia&pagina=2');
  });

  it('enlaza todas las noticias', () => {
    expect(buildPostsHref({ ...base, news: true }, { page: 2 })).toBe('/consejos?tipo=noticias&pagina=2');
  });
});
