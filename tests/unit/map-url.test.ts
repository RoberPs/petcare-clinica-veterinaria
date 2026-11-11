import { describe, expect, it } from 'vitest';
import { buildOsmEmbedUrl, buildOsmLink } from '@/domain/map';

describe('URLs de OpenStreetMap', () => {
  it('el mapa incrustado lleva un bbox centrado en las coordenadas y el marcador con 6 decimales', () => {
    const url = new URL(buildOsmEmbedUrl(40.4153, -3.6845));
    expect(url.origin).toBe('https://www.openstreetmap.org');
    expect(url.pathname).toBe('/export/embed.html');
    expect(url.searchParams.get('bbox')).toBe('-3.689500,40.412300,-3.679500,40.418300');
    expect(url.searchParams.get('marker')).toBe('40.415300,-3.684500');
    expect(url.searchParams.get('layer')).toBe('mapnik');
  });

  it('el enlace externo usa mlat, mlon y zoom 17 con 6 decimales', () => {
    expect(buildOsmLink(40.4153, -3.6845)).toBe(
      'https://www.openstreetmap.org/?mlat=40.415300&mlon=-3.684500#map=17/40.415300/-3.684500',
    );
  });
});
