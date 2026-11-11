import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT, FAKE_EMAIL_PORT, testEnv } from './tests/test-env';

// Las pruebas comparten una sola base de datos y algunas recargan el contenido, así que van en serie.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    {
      name: 'no-js',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 }, javaScriptEnabled: false },
    },
  ],
  webServer: [
    {
      command: `node scripts/fake-email-provider.ts --port ${FAKE_EMAIL_PORT}`,
      url: `http://localhost:${FAKE_EMAIL_PORT}/emails`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run build && npm start -- -p ${E2E_PORT}`,
      url: `http://localhost:${E2E_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: testEnv,
    },
  ],
});
