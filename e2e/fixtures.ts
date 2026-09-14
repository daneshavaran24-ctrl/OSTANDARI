import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * ثابت‌های تست‌های پنل ادمین.
 *
 * ⚠️ این فایل باید **بدون اثر جانبی** بماند. هم فرایند اصلی Playwright و هم هر
 * ورکر آن را وارد می‌کنند؛ اگر اینجا دیتابیس موقت ساخته شود، هر فرایند فایل
 * خودش را می‌سازد و تست، دیتابیسی جز آنچه سرور می‌نویسد را می‌خواند — همان
 * اشتباهی که باعث شد تست‌های ذخیره‌ی تنظیمات و تاریخچه بی‌دلیل قرمز شوند.
 *
 * مسیر ثابت است تا هر دو طرف روی یک فایل توافق داشته باشند؛ ساخت و پاک کردنش
 * در `e2e/global-setup.ts` انجام می‌شود.
 */

export const E2E_DIR = join(tmpdir(), 'ostandari-e2e');
export const E2E_DB = join(E2E_DIR, 'e2e.db');
export const E2E_KEY = Buffer.from('e2e-test-key-e2e-test-key-e2e-te').toString('base64');
export const E2E_ADMIN_PASSWORD = 'e2e-admin-password';
