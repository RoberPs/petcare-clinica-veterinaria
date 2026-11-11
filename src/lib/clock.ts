import { headers } from 'next/headers';

/**
 * Hora actual del servidor. Solo si TEST_CLOCK_ENABLED=1 (entorno de pruebas de extremo a extremo)
 * se admite la cabecera `x-test-now` para simular otra hora. En producción esa variable no existe.
 */
export async function getNow(): Promise<Date> {
  if (process.env.TEST_CLOCK_ENABLED === '1') {
    const value = (await headers()).get('x-test-now');
    if (value) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}
