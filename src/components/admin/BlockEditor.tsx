import { agendaStaff } from '@/db/queries/admin-agenda';
import type { ScheduleBlockRecord } from '@/db/queries/schedule-blocks';
import { BLOCK_FIELDS, parseBlockForm } from '@/domain/admin-schemas';
import { localDateTime } from '@/domain/availability';
import { blockSummary } from '@/domain/blocks';
import { todayInClinic } from '@/domain/time';
import { previewBlock } from '@/lib/admin/blocks';
import { createSubmissionToken } from '@/lib/form-token';
import { AdminNotice } from './AdminNotice';
import { BlockConfirmStep, BlockEditStep } from './BlockForm';

// Alta y edición de un bloqueo (F10): sin ?revisar=1, el paso 1; con él y datos válidos, el paso 2
// con las citas afectadas; con datos no válidos, el paso 1 con los errores junto a cada campo.

type Raw = Record<string, string | string[] | undefined>;

/** Valores del formulario a partir de un bloqueo guardado. */
function valuesOf(b: ScheduleBlockRecord): Raw {
  const common = { id: b.id, scope: b.teamMemberId ? 'staff' : 'clinic', staff_id: b.teamMemberId ?? '', reason: b.reason, kind: b.kind };
  if (b.kind === 'once') {
    const s = localDateTime(b.startsAt);
    const e = localDateTime(b.endsAt);
    return { ...common, start_date: s.date, start_time: s.time, end_date: e.date, end_time: e.time };
  }
  return { ...common, from_date: b.fromDate, until_date: b.untilDate, weekdays: b.weekdays.map(String), weekly_start: b.startTime, weekly_end: b.endTime };
}

export async function BlockEditor(props: {
  searchParams: Raw;
  block: ScheduleBlockRecord | null;
  now: Date;
  action: (form: FormData) => Promise<void>;
}) {
  const { searchParams: sp, block, now } = props;
  const base = block ? `/admin/bloqueos/${block.id}` : '/admin/bloqueos/nuevo';
  const reviewing = sp.revisar === '1';
  const values: Raw = reviewing ? Object.fromEntries(BLOCK_FIELDS.map((f) => [f, sp[f]])) : block ? valuesOf(block) : {};
  if (block) values.id = block.id;
  const staff = await agendaStaff([]);
  const today = todayInClinic(now);

  if (reviewing) {
    const parsed = parseBlockForm(values, now);
    if (parsed.ok) {
      const affected = await previewBlock(parsed.draft, { now, editingId: block?.id ?? null });
      const staffName = parsed.draft.teamMemberId ? (staff.find((m) => m.id === parsed.draft.teamMemberId)?.name ?? null) : null;
      const editQuery = new URLSearchParams();
      for (const f of BLOCK_FIELDS) {
        const v = values[f];
        for (const x of v === undefined ? [] : Array.isArray(v) ? v : [v]) if (x) editQuery.append(f, x);
      }
      return (
        <>
          <AdminNotice searchParams={sp} />
          <BlockConfirmStep
            action={props.action}
            editHref={`${base}?${editQuery.toString()}`}
            values={values}
            summary={`${blockSummary(parsed.draft, staffName)}. Motivo: ${parsed.draft.reason}.`}
            affected={affected}
            submissionToken={createSubmissionToken(now)}
          />
        </>
      );
    }
    return (
      <>
        <AdminNotice searchParams={sp} />
        <BlockEditStep action={base} values={values} errors={parsed.errors} staff={staff} today={today} />
      </>
    );
  }
  return (
    <>
      <AdminNotice searchParams={sp} />
      <BlockEditStep action={base} values={values} errors={{}} staff={staff} today={today} />
    </>
  );
}
