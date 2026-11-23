'use server';

import { notFound, redirect } from 'next/navigation';
import { adminFieldErrors, formObject, staffForm, uuid, weekForm } from '@/domain/admin-schemas';
import { noticeQuery, panelToken } from '@/lib/admin/action-helpers';
import { formValues, type AdminFormState } from '@/lib/admin/form-state';
import { saveStaffHours as saveStaffHoursRecord } from '@/lib/admin/hours';
import { saveStaff as saveStaffRecord } from '@/lib/admin/staff';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

// Server Actions de los veterinarios y su horario (US3, contracts/routes.md). Cada una empieza por
// requireAdmin() y está registrada en ADMIN_ACTIONS.

export async function saveStaff(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const now = await getNow();
  const token = panelToken(form, now);
  if (!token.ok) return { status: 'expired' };
  const parsed = staffForm.safeParse(formObject(form, ['service_ids']));
  if (!parsed.success) return { status: 'invalid', fieldErrors: adminFieldErrors(parsed.error), values: formValues(form) };
  const r = await saveStaffRecord(admin, parsed.data, { now, submissionId: token.submissionId });
  if (r.status === 'not_found') notFound();
  if (r.status === 'invalid') return { status: 'invalid', fieldErrors: r.fieldErrors, values: formValues(form) };
  if (r.status === 'error') return { status: 'error' };
  redirect(`/admin/veterinarios/${r.id}?aviso=guardado`);
}

export async function saveStaffHours(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const now = await getNow();
  const token = panelToken(form, now);
  if (!token.ok) return { status: 'expired' };
  const staffId = uuid.safeParse(form.get('staff_id'));
  if (!staffId.success) return { status: 'invalid', fieldErrors: { _form: 'Falta el veterinario.' }, values: formValues(form) };
  const week = weekForm((name) => {
    const v = form.get(name);
    return typeof v === 'string' ? v : null;
  });
  const r = await saveStaffHoursRecord(admin, staffId.data, week, { now });
  if (r.status === 'not_found') notFound();
  if (r.status === 'invalid') return { status: 'invalid', fieldErrors: r.fieldErrors, values: formValues(form) };
  if (r.status === 'error') return { status: 'error' };
  redirect(
    `/admin/veterinarios/${staffId.data}/horario?${noticeQuery({ aviso: 'guardado', afectadas: r.affected, 'fuera-clinica': r.outsideClinic })}`,
  );
}
