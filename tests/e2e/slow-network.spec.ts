import { testEnv } from '../test-env';
import { expect, test } from './fixtures';

// SC-008: con 3G lento el titular y el teléfono se leen en menos de 4 s, y el CLS es 0,1 o menos.
test('3G lento: titular y teléfono en menos de 4 s y CLS ≤ 0,1', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'mobile-360', 'CDP en un solo perfil');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // Perfil "Slow 3G" de Chrome DevTools: 400 ms de latencia y unos 400 kbit/s.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  const start = Date.now();
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 4_000 });
  await expect(page.getByRole('contentinfo').getByRole('link', { name: testEnv.CLINIC_PHONE_DISPLAY })).toBeAttached({ timeout: 4_000 });
  expect(Date.now() - start).toBeLessThan(4_000);

  await page.waitForLoadState('load', { timeout: 30_000 });
  await page.waitForTimeout(1_000);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThanOrEqual(0.1);
});
