import { asc, eq } from 'drizzle-orm';
import { buildAccountExport, exportFileName } from '@/domain/account-export';
import { getDb } from '@/db/client';
import { getCustomerById } from '@/db/queries/customers';
import { listCustomerAppointments } from '@/db/queries/appointments';
import { listPets } from '@/db/queries/pets';
import { clinic, customerConsents } from '@/db/schema';
import { loginUrl } from '@/lib/auth/require-customer';
import { lookupSession, SESSION_COOKIE } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import { isSameOriginRequest } from '@/lib/same-origin';

// "Descargar mis datos" (A11): POST /api/account/export. Sin JavaScript es un formulario normal. La
// sesión se lee de la cookie de la propia petición, así que la lógica se prueba sin Next.js.

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function handleExportRequest(request: Request, now: Date): Promise<Response> {
  if (!isSameOriginRequest(request.headers)) {
    return Response.json({ error: 'origen no permitido' }, { status: 403, headers: NO_STORE });
  }
  const token = readCookie(request, SESSION_COOKIE);
  const session = token ? await lookupSession(token, now) : null;
  if (!session) {
    return new Response(null, {
      status: 303,
      headers: { Location: loginUrl('/mi-cuenta/datos'), ...NO_STORE },
    });
  }

  const db = getDb();
  const [customer, consents, pets, [owner], appointments] = await Promise.all([
    getCustomerById(session.id),
    db
      .select()
      .from(customerConsents)
      .where(eq(customerConsents.customerId, session.id))
      .orderBy(asc(customerConsents.createdAt)),
    listPets(session.id),
    db.select({ name: clinic.legalOwnerName, contactEmail: clinic.legalContactEmail }).from(clinic).limit(1),
    listCustomerAppointments(session.id),
  ]);
  if (!customer || !owner)
    return Response.json({ error: 'no disponible' }, { status: 500, headers: NO_STORE });

  const body = JSON.stringify(
    buildAccountExport({ controller: owner, customer, consents, pets, appointments }, now),
    null,
    2,
  );
  logger.info({ customer_id: session.id }, 'data_exported');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(now)}"`,
      ...NO_STORE,
    },
  });
}
