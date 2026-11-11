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
];

/** Rutas dinámicas e indexables que tampoco se guardan en caché (los pasos 1 y 2 de /pide-cita). */
const NO_STORE_ROUTES = ['/pide-cita'];

/**
 * Enlace de gestión de la clínica (B7): el token va en la ruta, así que nunca sale del sitio como
 * Referer. Es "same-origin" y no "no-referrer" porque con "no-referrer" el navegador envía
 * `Origin: null` en los POST sin JavaScript y Next.js rechaza la Server Action (CSRF).
 */
const MANAGE_HEADERS = [
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Metadatos siempre en el <head> del HTML inicial (sin "streaming"): título y robots llegan
  // también sin JavaScript y antes de cualquier script.
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  // Argon2id (A1) es un módulo nativo: se carga desde node_modules en tiempo de ejecución, sin empaquetar.
  serverExternalPackages: ['@node-rs/argon2'],
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
    ];
  },
};

export default nextConfig;
