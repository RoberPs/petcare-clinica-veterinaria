'use server';

import { notFound, redirect } from 'next/navigation';
import { BLOCK_FIELDS, blockDecision, parseBlockForm, uuid } from '@/domain/admin-schemas';
import { sendEmailsSoon } from '@/email/outbox';
import { noticeQuery, panelToken } from '@/lib/admin/action-helpers';
import { deleteBlock as deleteBlockRecord, saveBlock as saveBlockRecord } from '@/lib/admin/blocks';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

// Server Actions de los bloqueos (US5, F10, contracts/routes.md). Cada una empieza por
// requireAdmin() y está registrada en ADMIN_ACTIONS. Si algo no cuadra, se vuelve al paso de
// revisión (GET) con los mismos datos; nunca se guarda a medias.

function blockQuery(form: FormData): URLSearchParams {
  const p = new URLSearchParams();
  for (const f of BLOCK_FIELDS) for (const v of form.getAll(f)) if (typeof v === 'string' && v !== '') p.append(f, v);
  p.set('revisar', '1');
  return p;
}

export async function saveBlock(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = uuid.safeParse(form.get('id'));
  const base = id.success ? `/admin/bloqueos/${id.data}` : '/admin/bloqueos/nuevo';
  const back = (aviso?: string) => {
    const p = blockQuery(form);
    if (aviso) p.set('aviso', aviso);
    return `${base}?${p.toString()}`;
  };
  const token = panelToken(form, now);
  if (!token.ok) redirect(back('caducado'));
  const raw: Record<string, string | string[]> = {};
  for (const f of BLOCK_FIELDS) raw[f] = form.getAll(f).filter((v): v is string => typeof v === 'string');
  const parsed = parseBlockForm(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, k === 'weekdays' ? v : (v[0] ?? '')])),
    now,
  );
  if (!parsed.ok) redirect(back());
  const decision = blockDecision.safeParse(form.get('decision'));
  const affectedIds = form
    .getAll('affected_ids')
    .filter((v): v is string => typeof v === 'string' && uuid.safeParse(v).success);
  const r = await saveBlockRecord(
    admin,
    {
      id: id.success ? id.data : null,
      submissionId: token.submissionId,
      draft: parsed.draft,
      decision: decision.success ? decision.data : undefined,
      affectedIds,
    },
    { now, onEmails: sendEmailsSoon },
  );
  if (r.status === 'ok')
    redirect(`/admin/agenda?${noticeQuery({ fecha: r.startDate, aviso: 'bloqueo-guardado', 'canceladas-n': r.cancelledCount })}`);
  if (r.status === 'not_found') notFound();
  if (r.status === 'affected_changed') redirect(back('afectadas-cambiadas'));
  if (r.status === 'decision_required') redirect(back('elige-decision'));
  redirect(back('error'));
}

export async function deleteBlock(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) redirect('/admin/bloqueos?aviso=error');
  if (!panelToken(form, now).ok) redirect('/admin/bloqueos?aviso=caducado');
  const r = await deleteBlockRecord(admin, id.data);
  if (r.status === 'not_found') notFound();
  redirect(r.status === 'ok' ? '/admin/bloqueos?aviso=bloqueo-borrado' : '/admin/bloqueos?aviso=error');
}
