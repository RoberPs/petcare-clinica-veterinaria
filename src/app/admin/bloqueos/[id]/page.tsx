import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlockEditor } from '@/components/admin/BlockEditor';
import { blockById } from '@/db/queries/schedule-blocks';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { deleteBlock, saveBlock } from '../actions';

export const metadata: Metadata = { title: 'Editar bloqueo' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Edición de un bloqueo (mismo flujo que el alta) y borrado sin revisión (F10).
export default async function AdminEditBlockPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  const block = await blockById(id);
  if (!block) notFound();
  return (
    <>
      <h2>Editar bloqueo</h2>
      <BlockEditor searchParams={sp} block={block} now={now} action={saveBlock} />
      <form className="form-actions" action={deleteBlock}>
        <input type="hidden" name="id" value={block.id} />
        <input type="hidden" name="submission" value={createSubmissionToken(now)} />
        <button className="btn btn--ghost" type="submit">
          Borrar el bloqueo
        </button>
      </form>
    </>
  );
}
