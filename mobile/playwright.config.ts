import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  grep: process.env.LIVE_CATALOG === '1' ? /@live/ : undefined,
  grepInvert: process.env.LIVE_CATALOG === '1' ? undefined : /@live/,
  use: { baseURL: 'http://127.0.0.1:8091', browserName: 'chromium', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-export.mjs', url: 'http://127.0.0.1:8091', reuseExistingServer: !process.env.CI, timeout: 30000 },
});
