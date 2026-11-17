import { describe, expect, it } from 'vitest';
import { markdownToPlainText } from '@/domain/markdown-text';

describe('markdownToPlainText', () => {
  it('quita las marcas de encabezado y conserva el texto', () => {
    expect(markdownToPlainText('## Primera sección\nTexto.\n### Detalle')).toBe('Primera sección Texto. Detalle');
  });

  it('quita el énfasis y el código en línea', () => {
    expect(markdownToPlainText('Un **baño** _templado_ con `champú`')).toBe('Un baño templado con champú');
  });

  it('quita las viñetas y las listas numeradas', () => {
    expect(markdownToPlainText('- uno\n* dos\n1. tres')).toBe('uno dos tres');
  });

  it('conserva el texto de los enlaces y el alt de las imágenes', () => {
    expect(markdownToPlainText('Pide [cita](section:reservas) ![Un gato](/media/x.svg)')).toBe('Pide cita Un gato');
  });

  it('quita citas y reglas horizontales', () => {
    expect(markdownToPlainText('> cita\n\n---\nfin')).toBe('cita fin');
  });

  it('devuelve cadena vacía con un cuerpo vacío', () => {
    expect(markdownToPlainText('  \n ')).toBe('');
  });
});
