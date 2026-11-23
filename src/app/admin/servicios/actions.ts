'use server';

import { notFound, redirect } from 'next/navigation';
import { adminFieldErrors, formObject, serviceForm } from '@/domain/admin-schemas';
import { noticeQuery, panelToken } from '@/lib/admin/action-helpers';
import { formValues, type AdminFormState } from '@/lib/admin/form-state';
import { saveService as saveServiceRecord } from '@/lib/admin/services';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

// Server Action de los servicios (US3, contracts/routes.md). Empieza por requireAdmin(): el layout
// no se ejecuta en las acciones. Está registrada en ADMIN_ACTIONS.

export async function saveService(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const now = await getNow();
  const token = panelToken(form, now);
  if (!token.ok) return { status: 'expired' };
  const parsed = serviceForm.safeParse(formObject(form, ['staff_ids']));
  if (!parsed.success) return { status: 'invalid', fieldErrors: adminFieldErrors(parsed.error), values: formValues(form) };
  const r = await saveServiceRecord(admin, parsed.data, { now, submissionId: token.submissionId });
  if (r.status === 'not_found') notFound();
  if (r.status === 'invalid') return { status: 'invalid', fieldErrors: r.fieldErrors, values: formValues(form) };
  if (r.status === 'error') return { status: 'error' };
  redirect(`/admin/servicios?${noticeQuery({ aviso: 'guardado', afectadas: r.futureCount, 'sin-franjas': r.noSlots })}`);
}
