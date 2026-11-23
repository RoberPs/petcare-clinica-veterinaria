import { describe, expect, it } from 'vitest';
import {
  availableSlots,
  nextAvailableDate,
  type AvailabilityInput,
  type BookingRules,
  type BookableService,
  type BookableStaff,
} from '@/domain/availability';
import type { WeeklySlot } from '@/domain/open-status';

// Lunes 16/11/2026, 09:00 en Madrid (UTC+1).
const NOW = new Date('2026-11-16T08:00:00Z');

const RULES: BookingRules = {
  slotStepMinutes: 30,
  minLeadMinutes: 120,
  horizonDays: 60,
  changeCutoffHours: 24,
  maxActivePerEmail: 3,
  maxActivePerCustomer: 9,
  reminderHoursBefore: 24,
  retentionMonths: 12,
};

const WEEKDAYS: WeeklySlot[] = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, opensAt: '09:30', closesAt: '14:00' },
  { weekday, opensAt: '16:30', closesAt: '20:00' },
]);

const STAFF: BookableStaff[] = [
  { id: 'a', slug: 'ana', name: 'Ana', position: 0, hours: WEEKDAYS },
  { id: 'b', slug: 'bea', name: 'Bea', position: 1, hours: WEEKDAYS },
];

const CONSULTA: BookableService = { id: 's1', slug: 'consulta', name: 'Consulta', durationMinutes: 30, staffIds: ['a', 'b'] };
const CIRUGIA: BookableService = { id: 's2', slug: 'cirugia', name: 'Cirugía', durationMinutes: 60, staffIds: ['b'] };

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  // Si se cambia el horario de la clínica, los profesionales tienen ese mismo horario (feature 007).
  const staff = overrides.weeklyHours ? STAFF.map((m) => ({ ...m, hours: overrides.weeklyHours! })) : STAFF;
  return {
    date: '2026-11-17',
    service: CONSULTA,
    staffId: null,
    staff,
    weeklyHours: WEEKDAYS,
    closures: [],
    blocks: [],
    busy: [],
    rules: RULES,
    now: NOW,
    ...overrides,
  };
}

const times = (i: AvailabilityInput) => availableSlots(i).map((s) => s.time);

describe('availableSlots', () => {
  it('genera los tramos de mañana y de tarde en pasos de la cuadrícula', () => {
    const t = times(input());
    expect(t[0]).toBe('09:30');
    expect(t).toContain('13:30');
    expect(t).not.toContain('14:00');
    expect(t).not.toContain('16:00');
    expect(t).toContain('16:30');
    expect(t.at(-1)).toBe('19:30');
    expect(t).toHaveLength(9 + 7);
  });

  it('el último inicio de cada tramo deja terminar el servicio antes del cierre', () => {
    const t = times(input({ service: CIRUGIA }));
    expect(t).toContain('13:00');
    expect(t).not.toContain('13:30');
    expect(t).toContain('19:00');
    expect(t).not.toContain('19:30');
  });

  it('convierte la hora local en instantes con la duración del servicio', () => {
    const [first] = availableSlots(input({ service: CIRUGIA }));
    expect(first!.startsAt.toISOString()).toBe('2026-11-17T08:30:00.000Z');
    expect(first!.endsAt.toISOString()).toBe('2026-11-17T09:30:00.000Z');
  });

  it('un día de cierre no tiene horas', () => {
    expect(times(input({ closures: [{ startsOn: '2026-11-17', endsOn: '2026-11-18' }] }))).toEqual([]);
  });

  it('el domingo sin horario no tiene horas', () => {
    expect(times(input({ date: '2026-11-22' }))).toEqual([]);
  });

  it('hoy respeta la antelación mínima', () => {
    const t = times(input({ date: '2026-11-16' }));
    // 09:00 + 120 min = 11:00.
    expect(t[0]).toBe('11:00');
    expect(t).not.toContain('10:30');
  });

  it('no ofrece días pasados ni más allá del horizonte', () => {
    expect(times(input({ date: '2026-11-13' }))).toEqual([]);
    // Hoy + 60 días = 15/01/2027 (viernes): vale; el lunes 18/01 ya no.
    expect(times(input({ date: '2027-01-15' })).length).toBeGreaterThan(0);
    expect(times(input({ date: '2027-01-18' }))).toEqual([]);
  });

  it('una fecha que no existe no tiene horas', () => {
    expect(times(input({ date: '2026-02-30' }))).toEqual([]);
    expect(times(input({ date: 'mañana' }))).toEqual([]);
  });

  it('un intervalo ocupado de un profesional deja libre al otro', () => {
    const busy = [{ teamMemberId: 'a', startsAt: new Date('2026-11-17T09:00:00Z'), endsAt: new Date('2026-11-17T09:30:00Z') }];
    const slots = availableSlots(input({ busy }));
    const at1000 = slots.find((s) => s.time === '10:00');
    expect(at1000?.freeStaffIds).toEqual(['b']);
    expect(slots.find((s) => s.time === '09:30')?.freeStaffIds).toEqual(['a', 'b']);
  });

  it('un solape parcial también ocupa (Cirugía de 60 min frente a una cita de 30)', () => {
    const busy = [{ teamMemberId: 'b', startsAt: new Date('2026-11-17T09:30:00Z'), endsAt: new Date('2026-11-17T10:00:00Z') }];
    const t = times(input({ service: CIRUGIA, busy }));
    // 10:00–11:00 y 10:30–11:30 pisan la de 10:30–11:00 (hora local); 11:00 ya está libre.
    expect(t).not.toContain('10:00');
    expect(t).not.toContain('10:30');
    expect(t).toContain('09:30');
    expect(t).toContain('11:00');
  });

  it('"Sin preferencia" ofrece una hora si hay cualquiera libre; un profesional concreto, solo si es él', () => {
    const busy = [{ teamMemberId: 'a', startsAt: new Date('2026-11-17T09:00:00Z'), endsAt: new Date('2026-11-17T09:30:00Z') }];
    expect(times(input({ busy }))).toContain('10:00');
    expect(times(input({ busy, staffId: 'a' }))).not.toContain('10:00');
    expect(times(input({ busy, staffId: 'b' }))).toContain('10:00');
  });

  it('un profesional que no atiende el servicio no tiene horas', () => {
    expect(times(input({ service: CIRUGIA, staffId: 'a' }))).toEqual([]);
  });

  it('un profesional despublicado (fuera de la lista) no se ofrece', () => {
    expect(availableSlots(input({ staff: [STAFF[1]!] }))[0]?.freeStaffIds).toEqual(['b']);
  });

  it('el cambio de hora de marzo descarta los inicios que no existen', () => {
    const night: WeeklySlot[] = [{ weekday: 7, opensAt: '01:00', closesAt: '04:00' }];
    const t = times(input({ date: '2027-03-28', weeklyHours: night, now: new Date('2027-03-20T08:00:00Z'), rules: { ...RULES, horizonDays: 30 } }));
    expect(t).toEqual(['01:00', '01:30', '03:00', '03:30']);
  });

  it('el cambio de hora de octubre descarta los inicios ambiguos', () => {
    const night: WeeklySlot[] = [{ weekday: 7, opensAt: '01:00', closesAt: '04:00' }];
    const t = times(input({ date: '2026-10-25', weeklyHours: night, now: new Date('2026-10-20T08:00:00Z') }));
    expect(t).toEqual(['01:00', '01:30', '03:00', '03:30']);
  });

  it('en un día normal de horario de verano el desfase es +2', () => {
    const [first] = availableSlots(input({ date: '2027-03-29', now: new Date('2027-03-20T08:00:00Z') }));
    expect(first!.startsAt.toISOString()).toBe('2027-03-29T07:30:00.000Z');
  });
});

describe('nextAvailableDate', () => {
  it('salta el fin de semana y los cierres', () => {
    const base = input({ closures: [{ startsOn: '2026-11-23', endsOn: '2026-11-23' }] });
    expect(nextAvailableDate({ ...base, from: '2026-11-21' })).toBe('2026-11-24');
  });

  it('devuelve el propio día si tiene huecos', () => {
    expect(nextAvailableDate({ ...input(), from: '2026-11-17' })).toBe('2026-11-17');
  });

  it('devuelve null si no hay hueco dentro del horizonte', () => {
    expect(nextAvailableDate({ ...input({ rules: { ...RULES, horizonDays: 5 } }), from: '2026-11-21' })).toBeNull();
    expect(nextAvailableDate({ ...input({ weeklyHours: [] }), from: '2026-11-17' })).toBeNull();
  });

  it('tiene en cuenta los intervalos ocupados de varios días', () => {
    // Un solo profesional, ocupado todo el martes.
    const busy = [{ teamMemberId: 'b', startsAt: new Date('2026-11-17T08:00:00Z'), endsAt: new Date('2026-11-17T19:00:00Z') }];
    expect(nextAvailableDate({ ...input({ service: CIRUGIA, busy }), from: '2026-11-17' })).toBe('2026-11-18');
  });
});

describe('horario por veterinario y bloqueos (feature 007, F7)', () => {
  const TUESDAY_10_13: WeeklySlot[] = [{ weekday: 2, opensAt: '10:00', closesAt: '13:00' }];

  it('intersección clínica ∩ veterinario: solo las franjas de su horario', () => {
    const staff: BookableStaff[] = [{ id: 'b', slug: 'bea', name: 'Bea', position: 1, hours: TUESDAY_10_13 }];
    const service: BookableService = { ...CIRUGIA, durationMinutes: 45 };
    const t = times(input({ staff, service, rules: { ...RULES, slotStepMinutes: 15 } }));
    expect(t[0]).toBe('10:00');
    expect(t[t.length - 1]).toBe('12:15');
    expect(t).not.toContain('09:30');
  });

  it('el horario del veterinario fuera del de la clínica no se ofrece', () => {
    const staff: BookableStaff[] = [
      { id: 'b', slug: 'bea', name: 'Bea', position: 1, hours: [{ weekday: 2, opensAt: '13:00', closesAt: '17:00' }] },
    ];
    // 13:00–17:00 ∩ clínica = 13:00–14:00 y 16:30–17:00; la cirugía de 60 min solo cabe a las 13:00.
    expect(times(input({ staff, service: CIRUGIA }))).toEqual(['13:00']);
    expect(times(input({ staff, service: { ...CIRUGIA, durationMinutes: 30 } }))).toEqual(['13:00', '13:30', '16:30']);
  });

  it('un veterinario sin tramos no ofrece franjas ni se asigna con "Sin preferencia"', () => {
    const staff: BookableStaff[] = [
      { id: 'a', slug: 'ana', name: 'Ana', position: 0, hours: [] },
      { id: 'b', slug: 'bea', name: 'Bea', position: 1, hours: WEEKDAYS },
    ];
    const slots = availableSlots(input({ staff }));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.freeStaffIds.length === 1 && s.freeStaffIds[0] === 'b')).toBe(true);
    expect(availableSlots(input({ staff, staffId: 'a' }))).toEqual([]);
  });

  it('un bloqueo del veterinario solo le quita sus franjas', () => {
    // Martes 17 de 10:00 a 12:00 en Madrid.
    const blocks = [{ blockId: 'x', teamMemberId: 'a', startsAt: new Date('2026-11-17T09:00:00Z'), endsAt: new Date('2026-11-17T11:00:00Z') }];
    const slots = availableSlots(input({ blocks }));
    const at10 = slots.find((s) => s.time === '10:00')!;
    expect(at10.freeStaffIds).toEqual(['b']);
    expect(availableSlots(input({ blocks, staffId: 'a' })).map((s) => s.time)).not.toContain('11:30');
    expect(availableSlots(input({ blocks, staffId: 'a' })).map((s) => s.time)).toContain('12:00');
  });

  it('un bloqueo de la clínica quita las franjas a todos', () => {
    const blocks = [{ blockId: 'x', teamMemberId: null, startsAt: new Date('2026-11-17T09:00:00Z'), endsAt: new Date('2026-11-17T11:00:00Z') }];
    const t = times(input({ blocks }));
    expect(t).not.toContain('10:00');
    expect(t).not.toContain('11:30');
    expect(t).toContain('12:00');
  });

  it('la duración que no cabe antes de un bloqueo no se ofrece', () => {
    // Descanso de 11:00 a 11:30: una cirugía de 60 minutos a las 10:30 ya no cabe.
    const blocks = [{ blockId: 'x', teamMemberId: 'b', startsAt: new Date('2026-11-17T10:00:00Z'), endsAt: new Date('2026-11-17T10:30:00Z') }];
    const t = times(input({ service: CIRUGIA, blocks }));
    expect(t).toContain('10:00');
    expect(t).not.toContain('10:30');
    expect(t).not.toContain('11:00');
    expect(t).toContain('11:30');
  });
});