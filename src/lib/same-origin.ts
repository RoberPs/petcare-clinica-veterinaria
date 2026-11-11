// CSRF de las rutas POST propias (no Server Actions): la petición tiene que venir de esta web.
// Sec-Fetch-Site si el navegador lo envía; si no, Origin frente al Host (o X-Forwarded-Host).

interface HeaderReader {
  get(name: string): string | null;
}

export function isSameOriginRequest(headers: HeaderReader): boolean {
  const site = headers.get('sec-fetch-site');
  if (site === 'same-origin') return true;
  if (site && site !== 'none') return false;
  const origin = headers.get('origin');
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
