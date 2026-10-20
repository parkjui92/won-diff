import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:4173', channel: process.env.CI ? undefined : 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]]
});
