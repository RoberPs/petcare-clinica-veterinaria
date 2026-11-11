// Asignación de "Sin preferencia" (B4): entre los profesionales libres, el que tenga menos citas
// confirmadas ese día; si empatan, el primero según `position` (orden de staffOrder).

export function assignStaff(
  freeStaffIds: readonly string[],
  dayLoad: ReadonlyMap<string, number>,
  staffOrder: readonly string[],
): string | null {
  if (freeStaffIds.length === 0) return null;
  const rank = (id: string) => {
    const i = staffOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...freeStaffIds].sort((a, b) => (dayLoad.get(a) ?? 0) - (dayLoad.get(b) ?? 0) || rank(a) - rank(b))[0]!;
}
