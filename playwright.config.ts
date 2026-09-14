import { defineConfig, devices } from '@playwright/test';

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
  webServer: {
    command: 'npm run dev',
    cwd: './demo-app',
    url: 'http://localhost:8080',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
