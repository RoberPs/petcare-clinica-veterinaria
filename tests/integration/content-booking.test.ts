import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { ContentValidationError, loadContentFile } from '@/content/load';
import { createAppointment, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Carga del bloque booking: (contracts/content-file.md, B15).

function variant(mutate: (c: Record<string, any>) => void): string {
  const content = parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>;
  mutate(content);
  const file = join(mkdtempSync(join(tmpdir(), 'petcare-')), 'variante.yaml');
  writeFileSync(file, stringify(content));
  return file;
}

async function loadError(file: string): Promise<string> {
  const db = await setupTestDb();
  try {
    await loadContentFile(db, file);
  } catch (error) {
    if (error instanceof ContentValidationError) return error.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
    throw error;
  }
  throw new Error('La carga debería haber fallado');
}

describe('carga del bloque booking:', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('crea las reglas, los servicios con su orden y el reparto de profesionales', async () => {
    const db = await setupTestDb();
    await loadContentFile(db, 'content/petcare.yaml');
    expect(await q('SELECT slot_step_minutes, horizon_days, change_cutoff_hours, reminder_hours_before FROM booking_settings')).toEqual([
      { slot_step_minutes: 30, horizon_days: 60, change_cutoff_hours: 24, reminder_hours_before: 24 },
    ]);
    const services = await q('SELECT slug, duration_minutes, position, published FROM booking_services ORDER BY position');
    expect(services.map((s) => s.slug)).toEqual(['consulta-general', 'vacunacion', 'revision-dental', 'cirugia', 'dermatologia', 'otro']);
    expect(services.find((s) => s.slug === 'cirugia')).toMatchObject({ duration_minutes: 60, position: 3, published: true });
    const staff = await q(`SELECT t.slug FROM booking_service_staff s JOIN booking_services b ON b.id = s.booking_service_id
      JOIN team_members t ON t.id = s.team_member_id WHERE b.slug = 'cirugia'`);
    expect(staff).toEqual([{ slug: 'inigo-barral' }]);
    // El enlace al tratamiento público y "Otro" sin enlace.
    expect(await q(`SELECT b.slug, s.slug AS service FROM booking_services b LEFT JOIN services s ON s.id = b.service_id
      WHERE b.slug IN ('cirugia', 'otro') ORDER BY b.slug`)).toEqual([
      { slug: 'cirugia', service: 'cirugia-programada' },
      { slug: 'otro', service: null },
    ]);
    expect(await q("SELECT href FROM sections WHERE key = 'reservas'")).toEqual([{ href: '/pide-cita' }]);
  });

  it('cargar dos veces no duplica nada y reemplaza el reparto', async () => {
    const db = await setupTestDb();
    await loadContentFile(db, 'content/petcare.yaml');
    await loadContentFile(
      db,
      variant((c) => {
        c.booking.services.find((s: any) => s.slug === 'consulta-general').staff = ['carlota-vives'];
      }),
    );
    expect(await q('SELECT count(*)::int AS n FROM booking_services')).toEqual([{ n: 6 }]);
    expect(await q(`SELECT t.slug FROM booking_service_staff s JOIN booking_services b ON b.id = s.booking_service_id
      JOIN team_members t ON t.id = s.team_member_id WHERE b.slug = 'consulta-general'`)).toEqual([{ slug: 'carlota-vives' }]);
  });

  it('un servicio que desaparece se despublica y sus citas siguen', async () => {
    const db = await setupTestDb();
    await loadContentFile(db, 'content/petcare.yaml');
    const appt = await createAppointment({ service: 'dermatologia', startsAt: new Date('2026-11-20T09:00:00Z') });
    await loadContentFile(
      db,
      variant((c) => {
        c.booking.services = c.booking.services.filter((s: any) => s.slug !== 'dermatologia');
      }),
    );
    expect(await q("SELECT published FROM booking_services WHERE slug = 'dermatologia'")).toEqual([{ published: false }]);
    expect(await q('SELECT status FROM appointments WHERE id = $1', [appt.id])).toEqual([{ status: 'confirmed' }]);
  });

  it('las reglas que faltan toman su valor por defecto', async () => {
    const db = await setupTestDb();
    await loadContentFile(
      db,
      variant((c) => {
        c.booking.rules = { horizon_days: 30 };
      }),
    );
    expect(await q('SELECT horizon_days, slot_step_minutes, max_active_per_email FROM booking_settings')).toEqual([
      { horizon_days: 30, slot_step_minutes: 30, max_active_per_email: 3 },
    ]);
  });

  it('un profesional que no está en team hace fallar la carga', async () => {
    const msg = await loadError(variant((c) => (c.booking.services[0].staff = ['nadie'])));
    expect(msg).toContain('booking.services[0].staff[0]: no existe el profesional "nadie" en team');
    expect(await q('SELECT count(*)::int AS n FROM booking_services')).toEqual([{ n: 0 }]);
  });

  it('una duración que no es múltiplo de 5 o que no cabe en el horario hace fallar la carga', async () => {
    expect(await loadError(variant((c) => (c.booking.services[0].duration_minutes = 32)))).toContain(
      'booking.services[0].duration_minutes: la duración debe ser un múltiplo de 5 minutos',
    );
    expect(await loadError(variant((c) => (c.booking.services[0].duration_minutes = 300)))).toContain(
      'no cabe en ningún tramo del horario (el más largo es de 270 min)',
    );
  });

  it('un servicio público inexistente y un slug repetido hacen fallar la carga', async () => {
    expect(await loadError(variant((c) => (c.booking.services[0].service = 'no-existe')))).toContain('no existe el servicio "no-existe"');
    expect(await loadError(variant((c) => (c.booking.services[1].slug = c.booking.services[0].slug)))).toContain('slug repetido');
  });

  it('sin el bloque, la carga falla si reservas tiene href; con href nulo, vale', async () => {
    expect(await loadError(variant((c) => delete c.booking))).toContain('falta el bloque booking');
    const db = await setupTestDb();
    await loadContentFile(
      db,
      variant((c) => {
        delete c.booking;
        c.sections.find((s: any) => s.key === 'reservas').href = null;
      }),
    );
    expect(await q('SELECT count(*)::int AS n FROM booking_services')).toEqual([{ n: 0 }]);
  });
});
