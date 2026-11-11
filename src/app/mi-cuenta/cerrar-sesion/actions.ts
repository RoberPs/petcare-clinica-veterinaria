'use server';

import { redirect } from 'next/navigation';
import { getCurrentSession, clearSessionCookie, revokeSession } from '@/lib/auth/session';
import { logger } from '@/lib/logger';

// Cerrar sesión (A2): POST que borra la fila y la cookie y vuelve a la portada con el aviso.
export async function logout(): Promise<void> {
  const current = await getCurrentSession();
  await revokeSession(current?.sessionHash);
  await clearSessionCookie();
  if (current) logger.info({ customer_id: current.id }, 'logout');
  redirect('/?aviso=sesion-cerrada');
}
