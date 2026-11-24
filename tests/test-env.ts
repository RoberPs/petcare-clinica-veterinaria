// Entorno común de las pruebas de integración y de extremo a extremo.
// Son valores de prueba: ninguno corresponde a una persona ni a un buzón real.
const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ?? 'postgres://petcare:petcare@localhost:5433/petcare_test';

export const E2E_PORT = 3100;
export const FAKE_EMAIL_PORT = 8026;

export const testEnv = {
  DATABASE_URL: testDatabaseUrl,
  DATABASE_URL_TEST: testDatabaseUrl,
  EMAIL_PROVIDER: 'fake',
  BREVO_API_KEY: '',
  EMAIL_FROM: 'PetCare Pruebas <no-responder@example.test>',
  FAKE_EMAIL_URL: `http://localhost:${FAKE_EMAIL_PORT}`,
  FORM_SECRET: 'secreto-de-pruebas-de-integracion-de-32-caracteres',
  CONSENT_VERSION: '1',
  CLINIC_INBOX_EMAIL: 'buzon-clinica@example.test',
  CLINIC_PHONE_E164: '+34600000000',
  CLINIC_PHONE_DISPLAY: '600 00 00 00',
  LEGAL_OWNER_NAME: 'Responsable de Pruebas',
  LEGAL_CONTACT_EMAIL: 'derechos@example.test',
  TRUSTED_PROXY_IPS: '',
  SITE_URL: `http://localhost:${E2E_PORT}`,
  // Solo en pruebas: permite simular la hora del servidor con la cabecera x-test-now.
  TEST_CLOCK_ENABLED: '1',
  // Feature 005: pasarela simulada, sin red.
  PAYMENT_PROVIDER: 'fake',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  // e2e corre con next start (NODE_ENV=production): la pasarela simulada se permite a propósito.
  PAYMENT_FAKE_ALLOWED: 'true',
  // Feature 006: huella anónima de las bajas del boletín (valor de prueba, 32 bytes en base64).
  NEWSLETTER_HASH_KEY: 'cHJ1ZWJhcy1ib2xldGluLWNsYXZlLWRlLTMyLWJ5dGU=',
  // Feature 008: fotos subidas desde el panel (las pruebas de integración usan un temporal propio).
  UPLOADS_DIR: './var/uploads-test',
} satisfies Record<string, string>;
