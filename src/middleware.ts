import { NextResponse, type NextRequest } from 'next/server';
import { isSectionKey } from '@/domain/sections';
import { buildCsp } from '@/lib/csp';
import { catalogRouteExists } from '@/db/queries/catalog-visibility';
import { isShopEnabled } from '@/db/queries/checkout-config';

/**
 * Catálogo (feature 004): /productos con la tienda apagada y una ficha inexistente o no visible
 * van al 404 normal por el mismo motivo que /proximamente. Si la consulta falla, la página decide.
 */
async function catalogRouteOk(pathname: string): Promise<boolean> {
  const match = pathname.match(/^\/productos(?:\/([^/]+))?\/?$/);
  if (!match) return true;
  try {
    return await catalogRouteExists(match[1] ? decodeURIComponent(match[1]) : null);
  } catch {
    return true;
  }
}

/**
 * Carrito y pago (feature 005): con la compra desactivada (sections.carrito.href nulo), sus rutas
 * van al 404 normal; la pasarela simulada, además, solo existe con PAYMENT_PROVIDER=fake.
 */
async function shopRouteOk(pathname: string): Promise<boolean> {
  if (!/^\/(carrito|finalizar-compra|pedido|pago-simulado)(\/|$)/.test(pathname)) return true;
  if (pathname.startsWith('/pago-simulado') && (process.env.PAYMENT_PROVIDER ?? 'fake') !== 'fake') return false;
  try {
    return await isShopEnabled();
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  // Ruta con la query, para volver al mismo paso (p. ej. de /pide-cita) tras el aviso de cookies o el login.
  requestHeaders.set('x-return-to', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  requestHeaders.set('Content-Security-Policy', csp);

  // Una sección desconocida va a la página 404 normal (con notFound() dentro de la página dinámica,
  // Next.js deja el cuerpo para el cliente y sin JavaScript no se vería nada).
  const coming = request.nextUrl.pathname.match(/^\/proximamente\/([^/]+)\/?$/);
  const { pathname } = request.nextUrl;
  const missing =
    (coming && !isSectionKey(decodeURIComponent(coming[1]!))) ||
    !(await catalogRouteOk(pathname)) ||
    !(await shopRouteOk(pathname));
  const response = missing
    ? NextResponse.rewrite(new URL('/__no-encontrada', request.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Node.js (Next 15.5) para poder consultar PostgreSQL desde el middleware.
  runtime: 'nodejs',
  matcher: [
    {
      source: '/((?!api/health|_next/static|_next/image|media/|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
