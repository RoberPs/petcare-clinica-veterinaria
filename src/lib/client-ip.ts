// IP del visitante para el límite por origen (R6 y R16).
//
// En producción, la app solo es accesible a través de Caddy (red chatbot_proxy, sin puertos
// publicados), y Caddy sustituye X-Forwarded-For por CF-Connecting-IP. Por eso, cuando hay
// TRUSTED_PROXY_IPS, se usa el primer valor de X-Forwarded-For: lo ha escrito el proxy de confianza.
// Sin proxy (en local), Next.js rellena X-Forwarded-For con la dirección del socket si no viene, y se
// usa el último valor. deploy/prueba-ip.sh comprueba que no se puede falsear en el despliegue.

interface HeaderReader {
  get(name: string): string | null;
}

export function getClientIp(headers: HeaderReader, trustedProxyIps: readonly string[]): string {
  const forwarded = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (forwarded.length === 0) return 'desconocida';
  return trustedProxyIps.length > 0 ? forwarded[0]! : forwarded[forwarded.length - 1]!;
}
