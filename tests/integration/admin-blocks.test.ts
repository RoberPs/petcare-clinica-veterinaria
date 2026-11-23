import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadBookingConfig } from '@/db/queries/booking-config';
import { parseBlockForm, type BlockDraft } from '@/domain/admin-schemas';
import { deleteBlock, previewBlock, saveBlock } from '@/lib/admin/blocks';
import { slotsForDay } from '@/lib/booking/slots';
import { createAppointment, createCustomer, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll, type BookingSeed } from './helpers/db';
import { NOW, TUESDAY } from './helpers/booking';

// Bloqueos desde el panel (US5, FR-026 a FR-028, F8, F10).

async function freeTimes(staffSlug: string, date = TUESDAY): Promise<string[]> {
  const config = (await loadBookingConfig())!;
  const service = config.services.find((s) => s.slug === 'consulta-general')!;
  const staffId = config.staff.find((m) => m.slug === staffSlug)!.id;
  return (await slotsForDay(config, { date, service, staffId, now: NOW })).map((s) => s.time);
}

function draft(raw: Record<string, string | string[]>): BlockDraft {
  const r = parseBlockForm({ reason: 'Vacaciones', ...raw }, NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.draft;
}

describe('bloqueos desde el panel', () => {
  let seed: BookingSeed;
  let admin: { id: string };

  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    seed = await seedBookingConfig();
    admin = { id: (await createCustomer({ admin: true })).id };
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  const nereaOnce = (start = '10:00', end = '12:00', date = TUESDAY) =>
    draft({ scope: 'staff', staff_id: seed.staff.nerea, kind: 'once', start_date: date, start_time: start, end_date: date, end_time: end });

  it('puntual de un veterinario: crear, editar y borrar, con efecto en slotsForDay', async () => {
    const save = await saveBlock(admin, { submissionId: randomUUID(), draft: nereaOnce(), affectedIds: [] }, { now: NOW });
    expect(save).toMatchObject({ status: 'ok', startDate: TUESDAY, cancelledCount: 0 });
    if (save.status !== 'ok') return;
    let t = await freeTimes('nerea-olmedo');
    expect(t).not.toContain('10:00');
    expect(t).not.toContain('11:30');
    expect(t).toContain('12:00');
    expect(await freeTimes('inigo-barral')).toContain('10:00');
    // Editar: ahora de 16:30 a 18:00.
    await saveBlock(admin, { id: save.blockId, submissionId: randomUUID(), draft: nereaOnce('16:30', '18:00'), affectedIds: [] }, { now: NOW });
    t = await freeTimes('nerea-olmedo');
    expect(t).toContain('10:00');
    expect(t).not.toContain('17:00');
    // Borrar.
    expect(await deleteBlock(admin, save.blockId)).toEqual({ status: 'ok' });
    expect(await freeTimes('nerea-olmedo')).toContain('17:00');
    expect((await q('SELECT action FROM admin_audit_log ORDER BY at')).map((a) => a.action)).toEqual(['block.create', 'block.update', 'block.delete']);
  });

  it('semanal de toda la clínica (descanso de 11:00 a 11:30 de lunes a viernes)', async () => {
    const d = draft({ scope: 'clinic', kind: 'weekly', from_date: '2026-11-16', until_date: '2027-02-16', weekdays: ['1', '2', '3', '4', '5'], weekly_start: '11:00', weekly_end: '11:30' });
    expect((await saveBlock(admin, { submissionId: randomUUID(), draft: d, affectedIds: [] }, { now: NOW })).status).toBe('ok');
    for (const staff of ['nerea-olmedo', 'inigo-barral']) {
      const t = await freeTimes(staff, '2026-11-18');
      expect(t).not.toContain('11:00');
      expect(t).toContain('10:30');
      expect(t).toContain('11:30');
    }
  });

  it('validaciones: fin anterior al inicio, en el pasado y más de 366 días', () => {
    const base = { reason: 'X', scope: 'clinic' };
    const bad1 = parseBlockForm({ ...base, kind: 'once', start_date: TUESDAY, start_time: '12:00', end_date: TUESDAY, end_time: '11:00' }, NOW);
    expect(bad1.ok ? null : bad1.errors.end_time).toMatch(/posterior/);
    const bad2 = parseBlockForm({ ...base, kind: 'once', start_date: '2026-11-02', start_time: '10:00', end_date: '2026-11-02', end_time: '11:00' }, NOW);
    expect(bad2.ok ? null : bad2.errors.end_date).toMatch(/pasado/);
    const bad3 = parseBlockForm({ ...base, kind: 'weekly', from_date: '2026-11-16', until_date: '2027-12-01', weekdays: '1', weekly_start: '11:00', weekly_end: '11:30' }, NOW);
    expect(bad3.ok ? null : bad3.errors.until_date).toMatch(/366/);
    const bad4 = parseBlockForm({ kind: 'weekly', scope: 'staff', from_date: '2026-11-16', until_date: '2026-11-30', weekly_start: '11:00', weekly_end: '11:30', reason: '' }, NOW);
    expect(bad4.ok ? {} : Object.keys(bad4.errors).sort()).toEqual(['reason', 'staff_id', 'weekdays']);
  });

  it('con citas afectadas: sin decisión se rechaza; keep las mantiene fuera de horario', async () => {
    const a = await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:30') });
    await createAppointment({ service: 'consulta-general', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '10:30') }); // otro veterinario
    const d = nereaOnce();
    const preview = await previewBlock(d, { now: NOW });
    expect(preview.map((p) => p.id)).toEqual([a.id]);
    expect(preview[0]).toMatchObject({ staffName: 'Dra. Nerea Olmedo', serviceName: 'Consulta general' });
    expect((await saveBlock(admin, { submissionId: randomUUID(), draft: d, affectedIds: [a.id] }, { now: NOW })).status).toBe('decision_required');
    expect(await q('SELECT count(*)::int AS n FROM schedule_blocks')).toEqual([{ n: 0 }]);
    const keep = await saveBlock(admin, { submissionId: randomUUID(), draft: d, affectedIds: [a.id], decision: 'keep' }, { now: NOW });
    expect(keep).toMatchObject({ status: 'ok', cancelledCount: 0 });
    expect(await q('SELECT status FROM appointments WHERE id = $1', [a.id])).toEqual([{ status: 'confirmed' }]);
    const [audit] = await q("SELECT changes FROM admin_audit_log WHERE action = 'block.create'");
    expect(audit!.changes).toMatchObject({ decision: 'keep', cancelledCount: 0, reason: 'Vacaciones' });
  });

  it('cancel_all: cancela todas con un correo por cita, en una transacción, e idempotente', async () => {
    const a = await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00'), contactEmail: 'a@example.test' });
    const b = await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '11:00'), contactEmail: 'b@example.test' });
    const submissionId = randomUUID();
    const input = { submissionId, draft: nereaOnce(), affectedIds: [b.id, a.id], decision: 'cancel_all' as const };
    const r = await saveBlock(admin, input, { now: NOW });
    expect(r).toMatchObject({ status: 'ok', cancelledCount: 2 });
    expect(await q("SELECT count(*)::int AS n FROM appointments WHERE status = 'cancelled' AND cancelled_by = 'clinic'")).toEqual([{ n: 2 }]);
    expect(await q("SELECT count(*)::int AS n FROM appointment_events WHERE kind = 'cancelled' AND actor = 'admin'")).toEqual([{ n: 2 }]);
    expect(await q("SELECT count(*)::int AS n FROM email_outbox WHERE kind = 'appointment_cancelled'")).toEqual([{ n: 2 }]);
    // Reenvío con el mismo submission_id: nada nuevo.
    expect(await saveBlock(admin, input, { now: NOW })).toMatchObject({ status: 'ok', cancelledCount: 0 });
    expect(await q("SELECT count(*)::int AS n FROM email_outbox WHERE kind = 'appointment_cancelled'")).toEqual([{ n: 2 }]);
    expect(await q('SELECT count(*)::int AS n FROM schedule_blocks')).toEqual([{ n: 1 }]);
  });

  it('si las afectadas cambian entre revisar y guardar, no se guarda nada', async () => {
    const a = await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00') });
    const d = nereaOnce();
    const reviewed = (await previewBlock(d, { now: NOW })).map((p) => p.id);
    await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '11:00') });
    const r = await saveBlock(admin, { submissionId: randomUUID(), draft: d, affectedIds: reviewed, decision: 'cancel_all' }, { now: NOW });
    expect(r).toEqual({ status: 'affected_changed' });
    expect(await q('SELECT count(*)::int AS n FROM schedule_blocks')).toEqual([{ n: 0 }]);
    expect(await q('SELECT status FROM appointments WHERE id = $1', [a.id])).toEqual([{ status: 'confirmed' }]);
  });
});
