// Solo se vuelve a rutas internas: empiezan por "/" y no por "//" ni "/\\" (evita redirecciones
// abiertas). Se rechaza cualquier carácter de control y la barra invertida en cualquier posición:
// el navegador quita los tabuladores y saltos de línea de una URL, así que "/\t/evil.example"
// acabaría siendo "//evil.example".
export function isSafeReturnTo(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 512 &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    // eslint-disable-next-line no-control-regex -- se buscan justo los caracteres de control
    !/[\u0000-\u001f\u007f\\]/.test(value)
  );
}
