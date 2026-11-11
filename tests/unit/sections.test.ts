import { describe, expect, it } from 'vitest';
import { isSectionKey, sectionHref, type Section } from '@/domain/sections';

const sections: Section[] = [
  { key: 'reservas', label: 'Pide cita', href: null },
  { key: 'tienda', label: 'Nuestros productos', href: '/tienda' },
  { key: 'carrito', label: 'Carrito', href: '' },
];

describe('sectionHref', () => {
  it('con href nulo lleva a /proximamente/<key>', () => {
    expect(sectionHref('reservas', sections)).toBe('/proximamente/reservas');
  });
  it('con href lo devuelve tal cual', () => {
    expect(sectionHref('tienda', sections)).toBe('/tienda');
  });
  it('un href vacío o una sección sin fila también llevan a Próximamente', () => {
    expect(sectionHref('carrito', sections)).toBe('/proximamente/carrito');
    expect(sectionHref('cuenta', sections)).toBe('/proximamente/cuenta');
  });
  it('solo reconoce las cinco claves', () => {
    expect(isSectionKey('consejos')).toBe(true);
    expect(isSectionKey('admin')).toBe(false);
  });
});
