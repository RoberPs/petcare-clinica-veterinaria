import type { WeeklySlot } from './open-status';

// Validación de la rejilla semanal del horario de un veterinario (F6, FR-016, FR-019).
// Hasta 3 tramos por día, en múltiplos de 5 minutos, con fin posterior al inicio y sin solapes.

export const MAX_RANGES_PER_DAY = 3;

export interface WeekRangeInput {
  /** "HH:MM" o vacío. */
  opens: string;
  closes: string;
}

/** Índice = día ISO − 1 (0 = lunes); cada día, hasta 3 tramos (los vacíos se ignoran). */
export type WeekInput = readonly (readonly WeekRangeInput[])[];

export type WeekErrors = Record<string, string>;

export type ValidateWeekResult = { ok: true; slots: WeeklySlot[] } | { ok: false; errors: WeekErrors };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutes(time: string): number | null {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Clave del error de un campo: "día.tramo.campo", p. ej. "1.0.opens" (lunes, primer tramo). */
export function weekFieldKey(weekday: number, index: number, field: 'opens' | 'closes'): string {
  return `${weekday}.${index}.${field}`;
}

export function validateWeek(days: WeekInput): ValidateWeekResult {
  const errors: WeekErrors = {};
  const slots: WeeklySlot[] = [];
  for (let d = 0; d < 7; d++) {
    const weekday = d + 1;
    const ranges = days[d] ?? [];
    const valid: { index: number; opens: number; closes: number }[] = [];
    ranges.forEach((r, index) => {
      const opensRaw = r.opens.trim();
      const closesRaw = r.closes.trim();
      if (!opensRaw && !closesRaw) return;
      if (index >= MAX_RANGES_PER_DAY) {
        errors[weekFieldKey(weekday, index, 'opens')] = `Como máximo ${MAX_RANGES_PER_DAY} tramos por día.`;
        return;
      }
      const opens = minutes(opensRaw);
      const closes = minutes(closesRaw);
      let bad = false;
      if (!opensRaw) {
        errors[weekFieldKey(weekday, index, 'opens')] = 'Indica la hora de inicio.';
        bad = true;
      } else if (opens === null) {
        errors[weekFieldKey(weekday, index, 'opens')] = 'Escribe la hora como HH:MM.';
        bad = true;
      } else if (opens % 5 !== 0) {
        errors[weekFieldKey(weekday, index, 'opens')] = 'La hora debe ir en múltiplos de 5 minutos.';
        bad = true;
      }
      if (!closesRaw) {
        errors[weekFieldKey(weekday, index, 'closes')] = 'Indica la hora de fin.';
        bad = true;
      } else if (closes === null) {
        errors[weekFieldKey(weekday, index, 'closes')] = 'Escribe la hora como HH:MM.';
        bad = true;
      } else if (closes % 5 !== 0) {
        errors[weekFieldKey(weekday, index, 'closes')] = 'La hora debe ir en múltiplos de 5 minutos.';
        bad = true;
      }
      if (bad || opens === null || closes === null) return;
      if (closes <= opens) {
        errors[weekFieldKey(weekday, index, 'closes')] = 'La hora de fin debe ser posterior a la de inicio.';
        return;
      }
      valid.push({ index, opens, closes });
    });
    const sorted = [...valid].sort((a, b) => a.opens - b.opens);
    sorted.forEach((r, i) => {
      const prev = sorted[i - 1];
      if (prev && r.opens < prev.closes) {
        errors[weekFieldKey(weekday, r.index, 'opens')] = 'Este tramo se solapa con otro del mismo día.';
      }
    });
    for (const r of sorted) slots.push({ weekday, opensAt: hhmm(r.opens), closesAt: hhmm(r.closes) });
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, slots };
}

function hhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function toMin(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * Tramos del veterinario que quedan (en todo o en parte) fuera del horario de la clínica. Se
 * guardan igualmente, pero esa parte no se ofrece (FR-019).
 */
export function outsideClinic(week: readonly WeeklySlot[], clinicHours: readonly WeeklySlot[]): WeeklySlot[] {
  return week.filter((s) => {
    const clinic = clinicHours
      .filter((c) => c.weekday === s.weekday)
      .map((c) => [toMin(c.opensAt), toMin(c.closesAt)] as const)
      .sort((a, b) => a[0] - b[0]);
    // ¿[opens, closes) está cubierto por la unión de los tramos de la clínica?
    let cursor = toMin(s.opensAt);
    const end = toMin(s.closesAt);
    for (const [o, c] of clinic) {
      if (o > cursor) break;
      if (c > cursor) cursor = c;
      if (cursor >= end) return false;
    }
    return cursor < end;
  });
}
