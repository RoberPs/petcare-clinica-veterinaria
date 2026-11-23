import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pruebas unitarias: lógica pura, sin base de datos.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    env: {
      FORM_SECRET: 'secreto-de-pruebas-unitarias-de-32-caracteres-o-mas',
      CONSENT_VERSION: '1',
      NEWSLETTER_HASH_KEY: 'cHJ1ZWJhcy1ib2xldGluLWNsYXZlLWRlLTMyLWJ5dGU=',
    },
  },
});
