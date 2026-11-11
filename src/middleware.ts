import { NextResponse, type NextRequest } from 'next/server';
import { isSectionKey } from '@/domain/sections';
import { buildCsp } from '@/lib/csp';


export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  requestHeaders.set('Content-Security-Policy', csp);

  // Una sección desconocida va a la página 404 normal (con notFound() dentro de la página dinámica,
  // Next.js deja el cuerpo para el cliente y sin JavaScript no se vería nada).
  const coming = request.nextUrl.pathname.match(/^\/proximamente\/([^/]+)\/?$/);
  const response =
    coming && !isSectionKey(decodeURIComponent(coming[1]!))
      ? NextResponse.rewrite(new URL('/__no-encontrada', request.url), { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
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
