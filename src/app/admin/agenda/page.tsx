import type { Metadata } from 'next';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AgendaDay } from '@/components/admin/AgendaDay';
import { AgendaToolbar, periodLabel } from '@/components/admin/AgendaToolbar';
import { AgendaWeek } from '@/components/admin/AgendaWeek';
import { agendaForRange, agendaStaff, staffBySlug } from '@/db/queries/admin-agenda';
import { loadBookingConfig, loadStaffHours } from '@/db/queries/booking-config';
import { blocksForRange } from '@/db/queries/schedule-blocks';
import { getSiteData } from '@/db/queries/site';
import { agendaRange, buildAgenda, parseAgendaParams } from '@/domain/agenda-view';
import { dayBounds } from '@/domain/availability';
import { addDays, todayInClinic } from '@/domain/time';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Agenda' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Agenda del día y de la semana por veterinario (US2, FR-007 a FR-011, F16).
export default async function AdminAgendaPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const [sp, now] = await Promise.all([searchParams, getNow()]);
  const today = todayInClinic(now);
  const params = parseAgendaParams(sp, today);
  const { from, days } = agendaRange(params);
  const filterStaff = params.staff ? await staffBySlug(params.staff) : null;
  const effective = filterStaff ? params : { ...params, staff: null };

  const [appointments, config, site, staffHours, blocks] = await Promise.all([
    agendaForRange(dayBounds(from).start, dayBounds(from, days).end, {
      staffId: filterStaff?.id ?? null,
      includeCancelled: params.includeCancelled,
    }),
    loadBookingConfig(),
    getSiteData(),
    loadStaffHours(),
    blocksForRange(from, addDays(from, days)),
  ]);
  const allStaff = await agendaStaff(appointments.map((a) => a.teamMemberId));
  const columns = buildAgenda({
    appointments,
    staff: filterStaff ? allStaff.filter((m) => m.id === filterStaff.id) : allStaff,
    clinicHours: config?.weeklyHours ?? site.hours,
    staffHours,
    closures: config?.closures ?? [],
    blocks,
    from,
    days,
    now,
  });

  return (
    <>
      <div className="admin-heading">
        <h2>Agenda</h2>
      </div>
      <AdminNotice searchParams={sp} />
      <AgendaToolbar params={effective} today={today} staff={allStaff} />
      <p className="admin-toolbar__period" aria-live="polite">
        {periodLabel(effective)}
      </p>
      {effective.view === 'semana' ? <AgendaWeek columns={columns} params={effective} /> : <AgendaDay columns={columns} />}
    </>
  );
}
