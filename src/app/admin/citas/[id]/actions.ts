'use server';

import { notFound, redirect } from 'next/navigation';
import { cancelForm, formObject, moveForm, uuid } from '@/domain/admin-schemas';
import { sendEmailsSoon } from '@/email/outbox';
import { panelToken } from '@/lib/admin/action-helpers';
import { adminCancel, adminMove, type AdminAppointmentResult } from '@/lib/admin/appointments';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

// Server Actions de cancelar y mover una cita desde el panel (US4, contracts/routes.md). Cada una
// empieza por requireAdmin() y está registrada en ADMIN_ACTIONS. Responden con PRG y un aviso.

const detail = (id: string, aviso: string) => `/admin/citas/${id}?aviso=${aviso}`;

function problem(id: string, r: AdminAppointmentResult): string {
  switch (r.status) {
    case 'stale':
      return detail(id, 'cita-cambiada');
    case 'not_editable':
      return detail(id, 'no-modificable');
    default:
      return detail(id, 'error');
  }
}

export async function cancelAppointmentAdmin(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const rawId = uuid.safeParse(form.get('id'));
  if (!rawId.success) redirect('/admin/agenda?aviso=error');
  if (!panelToken(form, now).ok) redirect(detail(rawId.data, 'caducado'));
  const parsed = cancelForm.safeParse(formObject(form));
  if (!parsed.success) redirect(`/admin/citas/${rawId.data}/cancelar?aviso=error`);
  const r = await adminCancel(admin, parsed.data, { now, onEmails: sendEmailsSoon });
  if (r.status === 'not_found') notFound();
  redirect(r.status === 'ok' ? detail(rawId.data, 'cancelada') : problem(rawId.data, r));
}

export async function moveAppointmentAdmin(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const rawId = uuid.safeParse(form.get('id'));
  if (!rawId.success) redirect('/admin/agenda?aviso=error');
  if (!panelToken(form, now).ok) redirect(detail(rawId.data, 'caducado'));
  const parsed = moveForm.safeParse(formObject(form));
  const back = (aviso: string) => {
    const p = new URLSearchParams();
    const date = form.get('date');
    const staff = form.get('staff_id');
    if (typeof date === 'string' && date) p.set('fecha', date);
    if (typeof staff === 'string' && staff) p.set('veterinario', staff);
    p.set('aviso', aviso);
    return `/admin/citas/${rawId.data}/mover?${p.toString()}`;
  };
  if (!parsed.success) redirect(back('elige-franja'));
  const r = await adminMove(admin, parsed.data, { now, onEmails: sendEmailsSoon });
  if (r.status === 'not_found') notFound();
  if (r.status === 'ok') redirect(detail(rawId.data, 'movida'));
  // Franja ocupada: vuelve a elegir con la fecha y el veterinario elegidos (US4, escenario 4).
  if (r.status === 'slot_taken' || r.status === 'invalid') redirect(back(r.status === 'invalid' ? 'elige-franja' : 'franja-ocupada'));
  redirect(problem(rawId.data, r));
}
