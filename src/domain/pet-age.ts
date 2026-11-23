import { Temporal } from '@js-temporal/polyfill';
import { zonedNow } from './time';

// Edad de una mascota (A10): "N año(s)", "N mes(es)" o "Menos de 1 mes", calculada con el día de hoy
// en Europe/Madrid. Los nacidos el 29 de febrero cumplen el 28 en los años no bisiestos.
//
// Se calcula a mano: `until()` de Temporal da "11 meses y 30 días" entre el 29/02 y el 28/02 del año
// siguiente, y la regla decidida es que ese día ya cumplen años.

/** Meses completos cumplidos. El "día del mes" se ajusta al último día si el mes es más corto. */
function fullMonths(birth: Temporal.PlainDate, today: Temporal.PlainDate): number {
  const months = (today.year - birth.year) * 12 + (today.month - birth.month);
  const monthiversary = Math.min(birth.day, today.daysInMonth);
  return today.day >= monthiversary ? months : months - 1;
}

export function petAge(birthDate: Temporal.PlainDate, today: Temporal.PlainDate): string {
  if (Temporal.PlainDate.compare(birthDate, today) > 0) return 'Menos de 1 mes';
  const total = fullMonths(birthDate, today);
  const years = Math.floor(total / 12);
  const months = total;
  if (years >= 1) return years === 1 ? '1 año' : `${years} años`;
  if (months >= 1) return months === 1 ? '1 mes' : `${months} meses`;
  return 'Menos de 1 mes';
}

/** Fecha de hoy en la zona de la clínica. `clock` es un instante o una función que lo devuelve. */
export function todayInClinicZone(clock: Date | (() => Date) = new Date()): Temporal.PlainDate {
  return zonedNow(typeof clock === 'function' ? clock() : clock).toPlainDate();
}
