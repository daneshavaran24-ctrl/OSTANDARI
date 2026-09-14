import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { E2E_ADMIN_PASSWORD, E2E_DB } from './fixtures';

/**
 * تست‌های پنل ادمین، روی یک دیتابیس موقت.
 *
 * سرور پنل روی پورت ۳۳۰۰ جداست، پس baseURL پیش‌فرض (اپ دمو) اینجا استفاده
 * نمی‌شود و نشانی کامل نوشته می‌شود.
 */

const ADMIN = 'http://localhost:3300';

async function login(page: import('@playwright/test').Page) {
  await page.goto(`${ADMIN}/admin/login`);
  await page.getByLabel('رمز عبور').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('احراز هویت پنل', () => {
  test('بدون ورود به صفحه‌ی ورود هدایت می‌شود', async ({ page }) => {
    await page.goto(`${ADMIN}/admin/restrictions`);
    await expect(page).toHaveURL(/\/admin\/login/);
    // مسیر مقصد نگه داشته می‌شود تا بعد از ورود همان‌جا برگردد
    expect(page.url()).toContain('next=%2Fadmin%2Frestrictions');
  });

  test('رمز غلط پیام خطا می‌دهد و وارد نمی‌شود', async ({ page }) => {
    await page.goto(`${ADMIN}/admin/login`);
    await page.getByLabel('رمز عبور').fill('رمز-کاملاً-غلط');
    await page.getByRole('button', { name: 'ورود' }).click();

    // فقط هشدار خودِ فرم؛ Next یک <div role="alert"> برای اعلام مسیر هم به هر
    // صفحه اضافه می‌کند و getByRole('alert') تنها به دو عنصر می‌خورد.
    await expect(page.getByRole('main').getByRole('alert')).toContainText('نادرست');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('رمز درست وارد پنل می‌کند', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'تنظیمات' })).toBeVisible();
  });
});

test.describe('تنظیمات', () => {
  test('تغییر مدت نشست در پایگاه داده ذخیره می‌شود', async ({ page }) => {
    await login(page);

    const field = page.getByLabel('مدت هر گفت‌وگو (ثانیه)');
    await expect(field).toHaveValue('300');
    await field.fill('75');
    await page.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByRole('status')).toContainText('ذخیره شد');

    // مقدار واقعاً در همان دیتابیسی نوشته شده که ایجنت می‌خواند
    const db = new DatabaseSync(E2E_DB);
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'session_duration_seconds'")
      .get() as { value: string };
    db.close();
    expect(row.value).toBe('75');
  });

  test('مدت کوتاه هشدار می‌دهد', async ({ page }) => {
    await login(page);
    await page.getByLabel('مدت هر گفت‌وگو (ثانیه)').fill('30');
    // با ۳۰ ثانیه گردش‌کار تیکت جا نمی‌شود؛ پنل باید صریح بگوید
    await expect(page.getByText(/گردش‌کار کامل پشتیبانی/)).toBeVisible();
  });
});

test.describe('محدودیت‌های موضوعی', () => {
  test('افزودن، غیرفعال کردن و حذف', async ({ page }) => {
    await login(page);
    await page.goto(`${ADMIN}/admin/restrictions`);

    const topic = `موضوع تست ${Date.now()}`;
    await page.getByLabel('موضوع').fill(topic);
    await page.getByLabel('پاسخ دستیار').fill('این پاسخ آزمایشی است.');
    await page.getByRole('button', { name: 'افزودن' }).click();

    const row = page.locator('li', { hasText: topic });
    await expect(row).toBeVisible();

    // غیرفعال کردن باید در دیتابیس بنشیند، چون ایجنت فقط فعال‌ها را می‌خواند
    await row.getByRole('checkbox').uncheck();
    await expect(async () => {
      const db = new DatabaseSync(E2E_DB);
      const r = db.prepare('SELECT enabled FROM restrictions WHERE topic = ?').get(topic) as
        | { enabled: number }
        | undefined;
      db.close();
      expect(r?.enabled).toBe(0);
    }).toPass({ timeout: 5000 });

    await row.getByRole('button', { name: 'حذف' }).click();
    await expect(page.locator('li', { hasText: topic })).toHaveCount(0);
  });
});

test.describe('کلیدهای API', () => {
  test('کلید ذخیره می‌شود ولی هرگز نمایش داده نمی‌شود', async ({ page }) => {
    await login(page);
    await page.goto(`${ADMIN}/admin/keys`);

    const secret = 'sk-proj-e2e-NEVER-SHOWN-4321';
    await page.getByLabel('کلید OpenAI').fill(secret);
    await page.getByRole('button', { name: 'ذخیره' }).first().click();

    // فقط چهار کاراکتر آخر
    await expect(page.getByText(/•••• 4321/)).toBeVisible();
    // و خود کلید هیچ‌جای صفحه نیست
    await expect(page.locator('body')).not.toContainText('NEVER-SHOWN');

    // در دیتابیس هم باید رمزشده باشد، نه متن ساده
    const db = new DatabaseSync(E2E_DB);
    const row = db
      .prepare("SELECT ciphertext FROM secrets WHERE name = 'openai_api_key'")
      .get() as { ciphertext: string };
    db.close();
    expect(row.ciphertext).not.toContain('NEVER-SHOWN');
    expect(row.ciphertext.length).toBeGreaterThan(20);
  });
});

test.describe('تاریخچه‌ی گفت‌وگو', () => {
  test('رونوشت ثبت‌شده در پنل دیده می‌شود', async ({ page }) => {
    // یک گفت‌وگوی ساختگی مستقیماً در دیتابیس، چون گفت‌وگوی واقعی به کلید معتبر
    // اوپن‌ای‌آی نیاز دارد. چیزی که سنجیده می‌شود نمایش پنل است.
    const db = new DatabaseSync(E2E_DB);
    const room = `e2e-room-${Date.now()}`;
    const convo = db
      .prepare('INSERT INTO conversations (room_name, duration_seconds) VALUES (?, ?) RETURNING id')
      .get(room, 27) as { id: number };
    const insert = db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    );
    insert.run(convo.id, 'user', 'سلام، نمی‌توانم وارد سامانه شوم');
    insert.run(convo.id, 'assistant', 'نام کاربری را با بک‌اسلش وارد کنید');
    db.close();

    await login(page);
    await page.goto(`${ADMIN}/admin/conversations`);

    const row = page.locator('li', { hasText: '۲ پیام' }).first();
    const anyRow = (await row.count()) > 0 ? row : page.locator('li').first();
    await anyRow.getByRole('button', { name: 'نمایش رونوشت' }).click();

    await expect(page.getByText('نمی‌توانم وارد سامانه شوم')).toBeVisible();
    await expect(page.getByText('با بک‌اسلش وارد کنید')).toBeVisible();
  });
});

test.describe('پیکربندی نشست', () => {
  test('مدت تعیین‌شده در پنل، بدون ورود هم برای اپ خوانده می‌شود', async ({ page, request }) => {
    await login(page);
    const field = page.getByLabel('مدت هر گفت‌وگو (ثانیه)');
    await field.fill('45');
    await page.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByRole('status')).toContainText('ذخیره شد');

    // فیکسچر request جدا از مرورگر است و کوکی ادمین را ندارد — دقیقاً مثل
    // کاربر کیوسکی که هرگز وارد پنل نمی‌شود.
    const anonymous = await request.get(`${ADMIN}/api/session-config`);
    expect(anonymous.status()).toBe(200);
    expect(await anonymous.json()).toEqual({ sessionDurationSeconds: 45 });
  });
});
