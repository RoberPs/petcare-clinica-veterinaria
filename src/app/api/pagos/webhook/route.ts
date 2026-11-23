import { handleWebhookRequest } from '@/lib/payments/webhook';

// Aviso de la pasarela (D7, contracts/payments.md). Runtime Node.js y cuerpo crudo para verificar la
// firma. No pasa por isSameOriginRequest: la autenticidad la da la firma HMAC.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 512 * 1024;

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });
  const { status } = await handleWebhookRequest(raw, request.headers, new Date());
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}
