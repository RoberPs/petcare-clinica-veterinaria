import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { appointments, bookingServices, scheduleBlocks, teamMembers } from '../schema';

// Rutas del panel con id (contracts/routes.md: "los ids que no existen dan 404"). Lo consulta el
// middleware, como el catálogo, para servir el 404 normal también sin JavaScript.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const db = () => getDb();

const ROUTES: [RegExp, (id: string) => Promise<unknown[]>][] = [
  [
    /^\/admin\/citas\/([^/]+)(?:\/(?:cancelar|mover))?\/?$/,
    (id) => db().select({ id: appointments.id }).from(appointments).where(eq(appointments.id, id)).limit(1),
  ],
  [
    /^\/admin\/servicios\/([^/]+)\/?$/,
    (id) => db().select({ id: bookingServices.id }).from(bookingServices).where(eq(bookingServices.id, id)).limit(1),
  ],
  [
    /^\/admin\/veterinarios\/([^/]+)(?:\/horario)?\/?$/,
    (id) => db().select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, id)).limit(1),
  ],
  [
    /^\/admin\/bloqueos\/([^/]+)\/?$/,
    (id) => db().select({ id: scheduleBlocks.id }).from(scheduleBlocks).where(eq(scheduleBlocks.id, id)).limit(1),
  ],
];

/** false si la ruta lleva un id (o "nuevo" no aplica) que no existe. Las demás rutas, true. */
export async function adminRouteExists(pathname: string): Promise<boolean> {
  for (const [re, check] of ROUTES) {
    const m = pathname.match(re);
    if (!m) continue;
    const id = decodeURIComponent(m[1]!);
    if (id === 'nuevo') return true;
    return UUID_RE.test(id) && (await check(id)).length > 0;
  }
  return true;
}
