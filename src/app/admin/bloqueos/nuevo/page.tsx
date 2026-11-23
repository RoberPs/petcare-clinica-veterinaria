import type { Metadata } from 'next';
import { BlockEditor } from '@/components/admin/BlockEditor';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { saveBlock } from '../actions';

export const metadata: Metadata = { title: 'Nuevo bloqueo' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Alta de un bloqueo (US5, F10): revisar por GET y confirmar por POST.
export default async function AdminNewBlockPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const [sp, now] = await Promise.all([searchParams, getNow()]);
  return (
    <>
      <h2>Nuevo bloqueo</h2>
      <BlockEditor searchParams={sp} block={null} now={now} action={saveBlock} />
    </>
  );
}
