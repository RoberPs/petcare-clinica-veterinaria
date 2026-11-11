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

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Metadatos siempre en el <head> del HTML inicial (sin "streaming"): título y robots llegan
  // también sin JavaScript y antes de cualquier script.
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  images: {
    // Las imágenes de la demo son SVG propios; se sirven tal cual (sin optimizador) y con dimensiones.
    dangerouslyAllowSVG: false,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
