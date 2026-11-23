import { isNewsletterEnabled } from '@/db/queries/newsletter';
import { unsubscribeWithToken } from '@/lib/newsletter/unsubscribe';

// Baja de un clic (RFC 8058, E10): el cliente de correo hace POST a la URL de List-Unsubscribe con el
// cuerpo "List-Unsubscribe=One-Click". Responde 200 vacío siempre (token no válido o ya dado de baja
// incluidos), para no revelar nada. GET → 405.

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!(await isNewsletterEnabled().catch(() => true))) return new Response(null, { status: 404 });
  const token = new URL(request.url).searchParams.get('t');
  await unsubscribeWithToken(token, 'one_click');
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
