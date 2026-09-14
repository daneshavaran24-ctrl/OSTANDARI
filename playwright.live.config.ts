import { defineConfig, devices } from '@playwright/test';
import {
  APP,
  APP_PORT,
  LIVEKIT_PORT,
  LIVE_DB,
  LIVE_KEY,
  livekit,
  usingExternalLiveKit,
} from './e2e/live/fixtures';

/**
 * آزمون‌های زنده — پیکربندی جدا از تست‌های معمولی.
 *
 * چرا جدا؟ چون این‌ها یک سرور LiveKit واقعی بالا می‌آورند و (در لایه‌ی صوتی)
 * کلید واقعی مصرف می‌کنند. اجرای معمولی `npx playwright test` نباید این هزینه
 * را بدهد.
 *
 *   npx playwright test -c playwright.live.config.ts --project=rpc
 *   npx playwright test -c playwright.live.config.ts --project=voice
 *
 * لایه‌ی `rpc` هیچ کلید پولی لازم ندارد و با سرور محلی کار می‌کند.
 * لایه‌ی `voice` بدون OPENAI_API_KEY خودش را رد می‌کند.
 */

const CHROMIUM_MEDIA_FLAGS = [
  // بدون این‌ها، Chromium بدون کاربر جلوی درخواست میکروفون متوقف می‌شود و
  // اتصال هرگز برقرار نمی‌شود.
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

export default defineConfig({
  testDir: './e2e/live',
  globalSetup: './e2e/live/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: APP,
    trace: 'retain-on-failure',
    launchOptions: {
      args: CHROMIUM_MEDIA_FLAGS,
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {}),
    },
  },
  projects: [
    { name: 'rpc', use: { ...devices['Desktop Chrome'] }, testMatch: /rpc-.*\.spec\.ts/ },
    { name: 'voice', use: { ...devices['Desktop Chrome'] }, testMatch: /voice\.spec\.ts/ },
  ],
  webServer: [
    // سرور LiveKit محلی — فقط وقتی LIVEKIT_URL از بیرون داده نشده باشد.
    ...(usingExternalLiveKit
      ? []
      : [
          {
            command: 'bash scripts/livekit-dev.sh',
            url: `http://127.0.0.1:${LIVEKIT_PORT}/`,
            reuseExistingServer: true,
            timeout: 60_000,
            env: { LIVEKIT_DEV_PORT: String(LIVEKIT_PORT) },
          },
        ]),
    {
      // بیلد توسعه کافی است و خیلی سریع‌تر بالا می‌آید؛ چیزی که اینجا سنجیده
      // می‌شود رفتار شبکه است، نه بهینه‌سازی بیلد.
      command: 'pnpm dev',
      cwd: './frontend',
      url: `${APP}/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: String(APP_PORT),
        DATABASE_PATH: LIVE_DB,
        ENCRYPTION_KEY: LIVE_KEY,
        LIVEKIT_URL: livekit.url,
        LIVEKIT_API_KEY: livekit.apiKey,
        LIVEKIT_API_SECRET: livekit.apiSecret,
        // کد دسترسی عمداً خالی است: آنچه اینجا سنجیده می‌شود RPC است، نه ورود.
        ACCESS_CODE: '',
        RATE_LIMIT_PER_MINUTE: '200',
      },
    },
  ],
});
