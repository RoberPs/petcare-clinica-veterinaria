import type { NextConfig } from 'next';

// Cabeceras de seguridad fijas. La CSP con nonce se genera por petición en src/middleware.ts (R14).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
];

// Rutas privadas y de autenticación (contracts/routes.md).
const PRIVATE_ROUTES = [
  '/mi-cuenta',
  '/mi-cuenta/:path*',
  '/iniciar-sesion',
  '/crear-cuenta',
  '/crear-cuenta/:path*',
  '/verificar-correo',
  '/recuperar-contrasena',
  '/recuperar-contrasena/:path*',
  '/restablecer-contrasena',
  '/api/account/:path*',
  // Reserva de citas (feature 003, contracts/routes.md).
  '/pide-cita/confirmada',
  '/gestion-cita/:path*',
  // Carrito y pago (feature 005, contracts/routes.md).
  '/carrito',
  '/finalizar-compra',
  '/pedido/:path*',
  '/pago-simulado/:path*',
  // Panel de administración (feature 007, F3).
  '/admin',
  '/admin/:path*',
];

/** Rutas dinámicas e indexables que tampoco se guardan en caché (los pasos 1 y 2 de /pide-cita). */
const NO_STORE_ROUTES = ['/pide-cita', '/boletin/:path*'];

/**
 * Enlace de gestión de la clínica (B7): el token va en la ruta, así que nunca sale del sitio como
 * Referer. Es "same-origin" y no "no-referrer" porque con "no-referrer" el navegador envía
 * `Origin: null` en los POST sin JavaScript y Next.js rechaza la Server Action (CSRF).
 */
const MANAGE_HEADERS = [
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

/**
 * Demo en GitHub Codespaces: el reenvío de puertos manda `X-Forwarded-Host: localhost:3000` con un
 * `Origin` `<codespace>-3000.app.github.dev`, y Next.js rechazaría las Server Actions (CSRF). Solo se
 * admite el origen de ese codespace, y solo cuando la app se construye dentro de él.
 */
const codespaceOrigin =
  process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : null;

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Metadatos siempre en el <head> del HTML inicial (sin "streaming"): título y robots llegan
  // también sin JavaScript y antes de cualquier script.
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  // Argon2id (A1) es un módulo nativo: se carga desde node_modules en tiempo de ejecución, sin empaquetar.
  serverExternalPackages: ['@node-rs/argon2'],
  experimental: {
    // Fotos de producto (feature 008, G4): el archivo admite hasta 5 MB (se comprueba en la
    // acción); el margen cubre el resto de campos del formulario multipart.
    serverActions: { bodySizeLimit: '6mb', ...(codespaceOrigin ? { allowedOrigins: [codespaceOrigin] } : {}) },
  },
  images: {
    // Las imágenes de la demo son SVG propios; se sirven tal cual (sin optimizador) y con dimensiones.
    dangerouslyAllowSVG: false,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Cuenta y autenticación (A3, FR-013): nunca en caché, para que "atrás" tras cerrar sesión
      // vuelva a pedir la página al servidor.
      ...[...PRIVATE_ROUTES, ...NO_STORE_ROUTES].map((source) => ({ source, headers: [{ key: 'Cache-Control', value: 'private, no-store' }] })),
      { source: '/gestion-cita/:path*', headers: MANAGE_HEADERS },
      // Boletín (feature 006): el token de confirmación o de baja va en la query.
      { source: '/boletin/:path*', headers: MANAGE_HEADERS },
      // Pedido de invitado y confirmación (D18): el token o la ref van en la URL.
      { source: '/pedido/:path*', headers: MANAGE_HEADERS },
      { source: '/pago-simulado/:path*', headers: MANAGE_HEADERS },
      // Panel (feature 007, F3): nunca se indexa.
      { source: '/admin', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
