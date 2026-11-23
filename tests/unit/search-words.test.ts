import { describe, expect, it } from 'vitest';
import { escapeLike, searchWords } from '@/domain/search';

describe('searchWords', () => {
  it('normaliza sin tildes ni mayúsculas', () => {
    expect(searchWords('BAÑO Perro')).toEqual(['bano', 'perro']);
    expect(searchWords('baño')).toEqual(searchWords('BANO'));
  });

  it('vacío o solo espacios no devuelve palabras', () => {
    expect(searchWords('')).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
  });

  it('se queda con 8 palabras distintas como mucho', () => {
    expect(searchWords('a b c d e f g h i j')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(searchWords('gato gato GATO')).toEqual(['gato']);
  });

  it('recorta el texto a 100 caracteres', () => {
    const [word] = searchWords('x'.repeat(150));
    expect(word).toHaveLength(100);
  });

  it('conserva % y _ como literales para escaparlos en la consulta', () => {
    expect(searchWords('100% a_b')).toEqual(['100%', 'a_b']);
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
  });
});
