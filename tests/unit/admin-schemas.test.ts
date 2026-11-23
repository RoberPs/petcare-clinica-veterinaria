import { describe, expect, it } from 'vitest';
import { agendaHref, parseAgendaParams, shiftAgenda, weekStart } from '@/domain/agenda-view';
import { cancelForm, dateParam, moveForm, serviceForm, staffForm, weekFieldName, weekForm } from '@/domain/admin-schemas';

// Esquemas Zod del panel (F18) y parámetros de la agenda (F16).

const ID = '11111111-1111-4111-8111-111111111111';

describe('esquemas del panel', () => {
  it('dateParam rechaza fechas que no existen', () => {
    expect(dateParam.safeParse('2026-11-17').success).toBe(true);
    expect(dateParam.safeParse('2026-02-30').success).toBe(false);
    expect(dateParam.safeParse('17/11/2026').success).toBe(false);
  });

  it('serviceForm: nombre 2–60, duración múltiplo de 5 de 5 a 480, casillas y veterinarios sin repetir', () => {
    const ok = serviceForm.parse({ name: ' Ecografía ', duration_minutes: '45', active: 'on', position: '2', staff_ids: [ID, ID] });
    expect(ok).toEqual({ name: 'Ecografía', duration_minutes: 45, active: true, position: 2, staff_ids: [ID] });
    expect(serviceForm.parse({ name: 'Ok', duration_minutes: '5', position: '0', staff_ids: [] }).active).toBe(false);
    for (const duration_minutes of ['0', '47', '485', 'abc']) {
      expect(serviceForm.safeParse({ name: 'Ok', duration_minutes, position: '0', staff_ids: [] }).success, duration_minutes).toBe(false);
    }
    expect(serviceForm.safeParse({ name: 'X', duration_minutes: '30', position: '0', staff_ids: [] }).success).toBe(false);
    expect(serviceForm.safeParse({ name: 'Ok', duration_minutes: '30', position: '0', staff_ids: ['no-es-id'] }).success).toBe(false);
  });

  it('staffForm', () => {
    expect(staffForm.parse({ name: 'Dra. Ruiz', booking_position: '1', service_ids: [] })).toEqual({
      name: 'Dra. Ruiz',
      bookable: false,
      booking_position: 1,
      service_ids: [],
    });
  });

  it('weekForm lee la rejilla d{día}_{tramo}_{campo}', () => {
    const w = weekForm((n) => ({ [weekFieldName(2, 0, 'opens')]: '10:00', [weekFieldName(2, 0, 'closes')]: '13:00' })[n] ?? null);
    expect(w).toHaveLength(7);
    expect(w[1]![0]).toEqual({ opens: '10:00', closes: '13:00' });
    expect(w[0]![2]).toEqual({ opens: '', closes: '' });
  });

  it('cancelForm: nota de hasta 300 caracteres y sin saltos de línea múltiples', () => {
    expect(cancelForm.parse({ id: ID, version: '2', note: ' Hola\r\n\r\n\nadiós ' })).toEqual({ id: ID, version: 2, note: 'Hola\nadiós' });
    expect(cancelForm.parse({ id: ID, version: '1' }).note).toBe('');
    expect(cancelForm.safeParse({ id: ID, version: '1', note: 'x'.repeat(301) }).success).toBe(false);
    expect(cancelForm.safeParse({ id: ID, version: '0' }).success).toBe(false);
  });

  it('moveForm', () => {
    expect(moveForm.safeParse({ id: ID, version: '1', date: '2026-11-17', time: '10:00', staff_id: ID }).success).toBe(true);
    expect(moveForm.safeParse({ id: ID, version: '1', date: '2026-11-17', time: '25:00', staff_id: ID }).success).toBe(false);
  });
});

describe('parámetros de la agenda', () => {
  it('valores no válidos caen a los de por defecto', () => {
    expect(parseAgendaParams({ vista: 'mes', fecha: '2026-02-30', veterinario: '<script>' }, '2026-11-16')).toEqual({
      view: 'dia',
      date: '2026-11-16',
      staff: null,
      includeCancelled: false,
    });
    expect(parseAgendaParams({ vista: 'semana', fecha: '2026-11-19', veterinario: 'nerea-olmedo', canceladas: '1' }, '2026-11-16')).toEqual({
      view: 'semana',
      date: '2026-11-19',
      staff: 'nerea-olmedo',
      includeCancelled: true,
    });
  });

  it('semana de lunes a domingo, anterior y siguiente, y URL con los filtros', () => {
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    const p = { view: 'semana' as const, date: '2026-11-19', staff: 'inigo-barral', includeCancelled: true };
    expect(shiftAgenda(p, 1)).toBe('2026-11-23');
    expect(shiftAgenda({ ...p, view: 'dia' }, -1)).toBe('2026-11-18');
    expect(agendaHref(p, { date: '2026-11-23' })).toBe('/admin/agenda?vista=semana&fecha=2026-11-23&veterinario=inigo-barral&canceladas=1');
  });
});
