import { defineConfig, devices } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_DB, E2E_KEY } from './e2e/fixtures';

/**
 * تست سرتاسری سناریوی دمو.
 *
 * اپ دمو با `npm run dev` بالا می‌آید نه با بیلد پروداکشن، چون سناریو به
 * ویرایش زنده‌ی public/blockusers.txt روی دیسک وابسته است — همان کاری که ابزار
 * unblock_user ایجنت انجام می‌دهد. در بیلد پروداکشن، public/ در زمان بیلد به
 * dist/ کپی می‌شود و نوشتن روی فایل مبدأ اثری ندارد.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // تست‌ها فایل مشترک blockusers.txt را عوض می‌کنند
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // اگر PLAYWRIGHT_CHROMIUM_PATH تنظیم باشد از همان مرورگر استفاده
        // می‌شود؛ برای محیط‌هایی که مرورگر از قبل نصب است و نباید دوباره
        // دانلود شود. در حالت عادی خالی می‌ماند و Playwright خودش انتخاب
        // می‌کند.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: './demo-app',
      url: 'http://localhost:8080',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // پنل ادمین روی یک دیتابیس موقت اجرا می‌شود تا تست‌ها داده‌ی واقعی را
      // دست نزنند. ENCRYPTION_KEY ثابت است چون تست باید بتواند همان مقداری
      // را که پنل رمز می‌کند دوباره بخواند.
      command: 'pnpm build && pnpm start',
      cwd: './frontend',
      url: 'http://localhost:3300/admin/login',
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        PORT: '3300',
        DATABASE_PATH: E2E_DB,
        ENCRYPTION_KEY: E2E_KEY,
        ADMIN_PASSWORD: E2E_ADMIN_PASSWORD,
        RATE_LIMIT_PER_MINUTE: '200',
        LIVEKIT_URL: 'wss://example.livekit.cloud',
        LIVEKIT_API_KEY: 'devkey',
        LIVEKIT_API_SECRET: 'devsecretdevsecretdevsecret',
      },
    },
  ],
});
