'use server';

import { notFound, redirect } from 'next/navigation';
import { adminFieldErrors, inClinicPaymentSchema, orderCancelSchema, ordersBackPath, orderStatusSchema, uuid } from '@/domain/store-schemas';
import { noticeQuery, panelToken } from '@/lib/admin/action-helpers';
import { formValues, type AdminFormState } from '@/lib/admin/form-state';
import {
  cancelOrderAdmin as cancelOrderRecord,
  confirmInClinicPayment as confirmInClinicPaymentRecord,
  retryRefundAdmin as retryRefundRecord,
  setOrderStatusAdmin as setOrderStatusRecord,
  type OrderActionFailure,
} from '@/lib/admin/orders';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

// Server Actions de los pedidos (US3 y US5, contracts/routes.md). Cada una empieza por
// requireAdmin() y está registrada en ADMIN_ACTIONS. Responden con POST-Redirect-GET al detalle.

const FAILURE_NOTICE: Record<OrderActionFailure['status'], string> = {
  stale: 'pedido-cambiado',
  not_allowed: 'transicion-no-permitida',
  not_found: 'no-encontrado',
  error: 'error',
};

function detailUrl(id: string, form: FormData, aviso: string): string {
  const volver = ordersBackPath(form.get('volver'));
  return `/admin/pedidos/${id}?${noticeQuery({ aviso, volver: volver === '/admin/pedidos' ? null : volver })}`;
}

function orderId(form: FormData): string {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) notFound();
  return id.data;
}

export async function setOrderStatusAdmin(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = orderId(form);
  if (!panelToken(form, now).ok) redirect(detailUrl(id, form, 'caducado'));
  const parsed = orderStatusSchema.safeParse({ id, from: form.get('from'), to: form.get('to') });
  if (!parsed.success) redirect(detailUrl(id, form, 'transicion-no-permitida'));
  const r = await setOrderStatusRecord(admin, parsed.data, now);
  if (r.status === 'not_found') notFound();
  redirect(detailUrl(id, form, r.status === 'ok' ? 'estado-cambiado' : FAILURE_NOTICE[r.status]));
}

export async function confirmInClinicPayment(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = orderId(form);
  if (!panelToken(form, now).ok) redirect(detailUrl(id, form, 'caducado'));
  const parsed = inClinicPaymentSchema.safeParse({ id, from: form.get('from'), deliver: form.get('deliver') });
  if (!parsed.success) redirect(detailUrl(id, form, 'pedido-no-vigente'));
  const r = await confirmInClinicPaymentRecord(admin, parsed.data, now);
  if (r.status === 'not_found') notFound();
  if (r.status === 'ok') redirect(detailUrl(id, form, parsed.data.deliver ? 'pago-y-entrega' : 'pago-confirmado'));
  redirect(detailUrl(id, form, r.status === 'not_allowed' || r.status === 'stale' ? 'pedido-no-vigente' : FAILURE_NOTICE[r.status]));
}

export async function cancelOrderAdmin(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = orderId(form);
  if (!panelToken(form, now).ok) return { status: 'expired' };
  const parsed = orderCancelSchema.safeParse({ id, from: form.get('from'), note: form.get('note') ?? '' });
  if (!parsed.success) return { status: 'invalid', fieldErrors: adminFieldErrors(parsed.error), values: formValues(form) };
  const r = await cancelOrderRecord(admin, parsed.data, now);
  if (r.status === 'not_found') notFound();
  if (r.status === 'ok') redirect(detailUrl(id, form, r.refund ? 'cancelado-reembolso' : 'cancelado'));
  if (r.status === 'error') return { status: 'error' };
  redirect(detailUrl(id, form, FAILURE_NOTICE[r.status]));
}

export async function retryRefundAdmin(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = orderId(form);
  if (!panelToken(form, now).ok) redirect(detailUrl(id, form, 'caducado'));
  const r = await retryRefundRecord(admin, id, now);
  if (r.status === 'not_found') notFound();
  if (r.status === 'ok') redirect(detailUrl(id, form, 'reembolso-reintentado'));
  redirect(detailUrl(id, form, r.status === 'not_failed' ? 'transicion-no-permitida' : FAILURE_NOTICE[r.status]));
}
