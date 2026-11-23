// URLs de OpenStreetMap (R9). Solo se usan con el consentimiento del visitante.

const fixed = (n: number) => n.toFixed(6);

/** Mapa incrustado con un marcador, centrado en las coordenadas y con un recuadro de unos 500 m. */
export function buildOsmEmbedUrl(lat: number, lng: number, span = { lat: 0.003, lng: 0.005 }): string {
  const bbox = [lng - span.lng, lat - span.lat, lng + span.lng, lat + span.lat].map(fixed).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${fixed(lat)},${fixed(lng)}`;
}

/** Enlace externo para abrir la ubicación en openstreetmap.org. */
export function buildOsmLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${fixed(lat)}&mlon=${fixed(lng)}#map=17/${fixed(lat)}/${fixed(lng)}`;
}
