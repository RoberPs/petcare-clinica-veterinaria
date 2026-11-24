import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/lib/env';
import { logErrorCode } from '@/lib/logger';
import { isSafeReturnTo } from '@/lib/return-to';

// Correcciones previas al despliegue (auditoría de seguridad tras la feature 008).

describe('isSafeReturnTo: redirecciones abiertas', () => {
  it('acepta rutas internas con query', () => {
    expect(isSafeReturnTo('/mi-cuenta/pedidos?estado=paid&pagina=2')).toBe(true);
  });

  it.each([
    ['tabulador', '/\t/evil.example'],
    ['tabulador al principio', '/\t\t/evil.example'],
    ['retorno de carro', '/\r/evil.example'],
    ['salto de línea', '/\n/evil.example'],
    ['NUL', '/\u0000/evil.example'],
    ['DEL', '/\u007f/evil.example'],
    ['barra invertida en medio', '/a\\..\\evil'],
    ['barra invertida tras la barra', '/\\evil.example'],
    ['doble barra', '//evil.example'],
  ])('rechaza %s', (_label, value) => {
    expect(isSafeReturnTo(value)).toBe(false);
  });
});

describe('logErrorCode: sin datos personales en los logs', () => {
  it('nunca devuelve el mensaje de un error de consulta con parámetros', () => {
    class DrizzleQueryError extends Error {
      constructor(cause: Error) {
        super('Failed query: insert into "contact_messages" ("email") values ($1)\nparams: persona@example.test');
        this.name = 'DrizzleQueryError';
        this.cause = cause;
      }
    }
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    const code = logErrorCode(new DrizzleQueryError(pgError));
    expect(code).toBe('DrizzleQueryError:23505');
    expect(code).not.toContain('example.test');
  });

  it('con un mensaje libre devuelve solo el nombre del error', () => {
    expect(logErrorCode(new TypeError('invalid input syntax for type uuid: "persona@example.test"'))).toBe('TypeError');
  });

  it('conserva los códigos propios en snake_case', () => {
    expect(logErrorCode(new Error('cart_gone'))).toBe('cart_gone');
    expect(logErrorCode(new Error('402'))).toBe('402');
  });

  it('devuelve "unknown" si no es un Error', () => {
    expect(logErrorCode('texto con persona@example.test')).toBe('unknown');
  });
});

describe('TEST_CLOCK_ENABLED: solo para los e2e en local', () => {
  const base = {
    DATABASE_URL: 'postgres://petcare:petcare@localhost:5433/petcare_test',
    EMAIL_PROVIDER: 'fake',
    EMAIL_FROM: 'PetCare <no-responder@example.test>',
    FAKE_EMAIL_URL: 'http://localhost:8026',
    FORM_SECRET: 'secreto-de-pruebas-unitarias-de-32-caracteres-o-mas',
    CONSENT_VERSION: '1',
    UPLOADS_DIR: '/app/var/uploads',
    PAYMENT_FAKE_ALLOWED: 'true',
    NODE_ENV: 'production',
  };

  it('se permite con http://localhost (los e2e corren con NODE_ENV=production)', () => {
    expect(parseEnv({ ...base, SITE_URL: 'http://localhost:3200', TEST_CLOCK_ENABLED: '1' })).toEqual({ ok: true });
  });

  it('se rechaza con un SITE_URL https', () => {
    const result = parseEnv({ ...base, SITE_URL: 'https://demo.example.test', TEST_CLOCK_ENABLED: '1' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('TEST_CLOCK_ENABLED');
  });

  it('con https y sin reloj de pruebas sigue siendo válido', () => {
    expect(parseEnv({ ...base, SITE_URL: 'https://demo.example.test' })).toEqual({ ok: true });
  });
});
