'use server';

import { notFound, redirect } from 'next/navigation';
import { adminFieldErrors, discountSchema, formObject, uuid } from '@/domain/store-schemas';
import { panelToken } from '@/lib/admin/action-helpers';
import { createDiscountCode as createDiscountRecord, setDiscountEnabled as setDiscountEnabledRecord } from '@/lib/admin/discounts';
import { formValues, type AdminFormState } from '@/lib/admin/form-state';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

// Server Actions de los códigos de descuento (US6, contracts/routes.md). Cada una empieza por
// requireAdmin() y está registrada en ADMIN_ACTIONS.

export async function createDiscountCode(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const now = await getNow();
  const token = panelToken(form, now);
  if (!token.ok) return { status: 'expired' };
  const parsed = discountSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: 'invalid', fieldErrors: adminFieldErrors(parsed.error), values: formValues(form) };
  const r = await createDiscountRecord(admin, parsed.data, { now, submissionId: token.submissionId });
  if (r.status === 'invalid') return { status: 'invalid', fieldErrors: r.fieldErrors, values: formValues(form) };
  if (r.status === 'error') return { status: 'error' };
  redirect('/admin/descuentos?aviso=creado');
}

export async function setDiscountEnabled(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) notFound();
  if (!panelToken(form, now).ok) redirect('/admin/descuentos?aviso=caducado');
  const enabled = form.get('enabled') === '1';
  const r = await setDiscountEnabledRecord(admin, id.data, enabled, now);
  if (r.status === 'not_found') notFound();
  if (r.status === 'error') redirect('/admin/descuentos?aviso=error');
  redirect(`/admin/descuentos?aviso=${enabled ? 'reactivado' : 'desactivado'}`);
}
