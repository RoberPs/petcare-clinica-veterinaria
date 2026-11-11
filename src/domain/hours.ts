import { formatTime, weekdayName } from './time';
import type { WeeklySlot } from './open-status';

// Presentación del horario semanal: completo (7 días) y resumido (días consecutivos iguales agrupados).

export interface DayHours {
  weekday: number;
  name: string;
  slots: string[]; // ["09:30–14:00", "16:30–20:00"]; vacío = cerrado
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function weeklyHours(slots: readonly WeeklySlot[]): DayHours[] {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    name: capitalize(weekdayName(weekday)),
    slots: slots
      .filter((s) => s.weekday === weekday)
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
      .map((s) => `${formatTime(s.opensAt)}–${formatTime(s.closesAt)}`),
  }));
}

export function formatSlots(slots: string[]): string {
  if (slots.length === 0) return 'cerrado';
  if (slots.length === 1) return slots[0]!;
  return `${slots.slice(0, -1).join(', ')} y ${slots[slots.length - 1]}`;
}

export interface HoursSummaryLine {
  days: string; // "Lunes a viernes", "Sábado"
  hours: string; // "09:30–14:00 y 16:30–20:00", "cerrado"
}

export function summarizeHours(slots: readonly WeeklySlot[]): HoursSummaryLine[] {
  const days = weeklyHours(slots);
  const lines: HoursSummaryLine[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    const key = days[i]!.slots.join('|');
    while (j + 1 < days.length && days[j + 1]!.slots.join('|') === key) j++;
    const first = days[i]!.name;
    const last = days[j]!.name.toLowerCase();
    const label = i === j ? first : j === i + 1 ? `${first} y ${last}` : `${first} a ${last}`;
    lines.push({ days: label, hours: formatSlots(days[i]!.slots) });
    i = j + 1;
  }
  return lines;
}
