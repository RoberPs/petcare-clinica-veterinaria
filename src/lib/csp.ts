// CSP con un nonce por petición (R14). Next.js aplica el nonce a sus scripts porque todo se renderiza
// en cada petición (R1). Los estilos admiten 'unsafe-inline' solo para los atributos que pone el propio
// framework (por ejemplo, next/image); el código de la web no usa estilos en línea (lo vigila check:design).
export function buildCsp(nonce: string, isDev = process.env.NODE_ENV === 'development'): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    'frame-src https://www.openstreetmap.org',
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}
