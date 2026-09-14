import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_DB, E2E_DIR } from './fixtures';

/**
 * دیتابیس موقت پنل ادمین را از نو می‌سازد.
 *
 * یک‌بار پیش از همه‌ی تست‌ها اجرا می‌شود، پس هر اجرا از حالت تمیز شروع می‌کند و
 * داده‌ی اجرای قبلی (مثلاً محدودیت‌های افزوده‌شده) تست بعدی را گمراه نمی‌کند.
 */
export default function globalSetup(): void {
  rmSync(E2E_DIR, { recursive: true, force: true });
  mkdirSync(E2E_DIR, { recursive: true });

  execFileSync('node', [resolve(__dirname, '..', 'db', 'migrate.mjs')], {
    env: { ...process.env, DATABASE_PATH: E2E_DB },
    stdio: 'ignore',
  });
}
