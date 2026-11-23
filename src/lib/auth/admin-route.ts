import { findSessionWithCustomer } from '@/db/queries/sessions';
import { hashToken, isSessionValid } from './session';

// Comprobación de solo lectura para el middleware (F3, con desviación anotada): una sesión vigente
// sin rol de administrador recibe el 404 normal también sin JavaScript (un notFound() dentro de una
// página dinámica no se ve sin JavaScript). Sin sesión, o si la consulta falla, decide el layout
// con requireAdmin(), que es la guardia de verdad. No toca la sesión (no actualiza last_seen_at).

export type AdminSessionStatus = 'anonymous' | 'admin' | 'not_admin';

export async function adminSessionStatus(token: string | undefined, now: Date): Promise<AdminSessionStatus> {
  if (!token || token.length > 100) return 'anonymous';
  const found = await findSessionWithCustomer(hashToken(token));
  if (!found || !isSessionValid(found.session, now) || !found.customer.emailVerifiedAt) return 'anonymous';
  return found.customer.isAdmin ? 'admin' : 'not_admin';
}
