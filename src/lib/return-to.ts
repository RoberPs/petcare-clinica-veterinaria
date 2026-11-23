// Solo se vuelve a rutas internas: empiezan por "/" y no por "//" ni "/\\" (evita redirecciones abiertas).
export function isSafeReturnTo(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 512 &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    !/[\r\n]/.test(value)
  );
}
