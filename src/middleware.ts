import { NextResponse, type NextRequest } from 'next/server';
import { isSectionKey } from '@/domain/sections';
import { buildCsp } from '@/lib/csp';
import { catalogRouteExists } from '@/db/queries/catalog-visibility';
import { isShopEnabled } from '@/db/queries/checkout-config';
import { isNewsletterEnabled } from '@/db/queries/newsletter';
import { postsRouteExists } from '@/db/queries/posts-visibility';
import { adminRouteExists } from '@/db/queries/admin-visibility';
import { adminSessionStatus } from '@/lib/auth/admin-route';
import { SESSION_COOKIE } from '@/lib/auth/session';

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
 * Consejos (feature 006, E3): con la sección desactivada, /consejos y sus publicaciones van al 404
 * normal, igual que una publicación inexistente, despublicada o con fecha futura.
 */
async function postsRouteOk(pathname: string): Promise<boolean> {
  const match = pathname.match(/^\/consejos(?:\/([^/]+))?\/?$/);
  if (!match) return true;
  try {
    return await postsRouteExists(match[1] ? decodeURIComponent(match[1]) : null);
  } catch {
    return true;
  }
}

/** Boletín (feature 006, E13): desactivado, sus páginas y su política van al 404 normal. */
async function newsletterRouteOk(pathname: string): Promise<boolean> {
  if (!/^\/(boletin(\/|$)|politica-del-boletin\/?$)/.test(pathname)) return true;
  try {
    return await isNewsletterEnabled();
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

const ADMIN_RE = /^\/admin(\/|$)/;

/**
 * Panel (feature 007, F2/F3): una sesión vigente sin rol va al 404 normal. Sin sesión pasa: el
 * layout redirige a iniciar sesión. Si la consulta falla, decide requireAdmin() en el layout.
 */
async function adminRouteOk(request: NextRequest): Promise<boolean> {
  if (!ADMIN_RE.test(request.nextUrl.pathname)) return true;
  try {
    const testNow = process.env.TEST_CLOCK_ENABLED === '1' ? request.headers.get('x-test-now') : null;
    const now = testNow && !Number.isNaN(new Date(testNow).getTime()) ? new Date(testNow) : new Date();
    const status = await adminSessionStatus(request.cookies.get(SESSION_COOKIE)?.value, now);
    if (status === 'not_admin') return false;
    // Un id inexistente da el 404 normal (solo con sesión de admin: el anónimo va a iniciar sesión).
    return status === 'admin' ? await adminRouteExists(request.nextUrl.pathname) : true;
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
    !(await postsRouteOk(pathname)) ||
    !(await newsletterRouteOk(pathname)) ||
    !(await shopRouteOk(pathname)) ||
    !(await adminRouteOk(request));
  const response = missing
    ? NextResponse.rewrite(new URL('/__no-encontrada', request.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  // Panel: sin indexar y sin caché (F3), también en el 404.
  if (ADMIN_RE.test(pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Cache-Control', 'no-store');
  }
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
