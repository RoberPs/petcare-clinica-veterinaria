import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { testEnv } from './tests/test-env.ts';

// Pruebas de integración contra PostgreSQL real (servicio "db-test" de docker-compose).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Feature 007: admin-authz llama a las páginas del panel (TSX); tsconfig usa jsx "preserve".
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: testEnv,
  },
});
