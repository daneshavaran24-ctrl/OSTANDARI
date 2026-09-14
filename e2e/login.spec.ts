import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BLOCK_FILE = resolve(__dirname, '../demo-app/public/blockusers.txt');
const ORIGINAL = readFileSync(BLOCK_FILE, 'utf8');

const USERNAME = '\\vienna\\maxman123';
const PASSWORD = 'passw0rd';

/** همان کاری که اسکریپت بازنشانی دمو می‌کند. */
function blockUser() {
  writeFileSync(BLOCK_FILE, 'maxman123\n', 'utf8');
}

/** همان کاری که ابزار unblock_user ایجنت می‌کند. */
function unblockUser() {
  writeFileSync(BLOCK_FILE, '', 'utf8');
}

test.afterAll(() => writeFileSync(BLOCK_FILE, ORIGINAL, 'utf8'));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test('کاربر مسدود پیام فارسی مسدودیت می‌گیرد', async ({ page }) => {
  blockUser();
  await page.goto('/');

  await page.getByLabel('نام کاربری').fill(USERNAME);
  await page.getByLabel('رمز عبور').fill(PASSWORD);
  await page.getByRole('button', { name: 'ورود' }).click();

  await expect(page.getByRole('alert')).toContainText('مسدود');
  await expect(page).toHaveURL(/\/$/);
});

test('بعد از رفع مسدودیت توسط ایجنت، ورود موفق می‌شود', async ({ page }) => {
  unblockUser();
  await page.goto('/');

  await page.getByLabel('نام کاربری').fill(USERNAME);
  await page.getByLabel('رمز عبور').fill(PASSWORD);
  await page.getByRole('button', { name: 'ورود' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /خوش آمدید/ })).toBeVisible();
});

test('قالب غلط نام کاربری رد می‌شود', async ({ page }) => {
  unblockUser();
  await page.goto('/');

  // بدون بک‌اسلش ابتدایی — رایج‌ترین اشتباهی که ایجنت باید اصلاحش کند
  await page.getByLabel('نام کاربری').fill('vienna\\maxman123');
  await page.getByLabel('رمز عبور').fill(PASSWORD);
  await page.getByRole('button', { name: 'ورود' }).click();

  await expect(page.getByRole('alert')).toContainText('نادرست');
});

test('فیلدهای ورود چپ‌به‌راست می‌مانند', async ({ page }) => {
  // کل سناریوی آموزشی ایجنت روی قالب \دامنه\نام‌کاربری بنا شده؛ اگر این فیلد
  // در صفحه‌ی راست‌به‌چپ جهت بگیرد، بک‌اسلش‌ها به‌هم می‌ریزند و کاربر نمی‌فهمد
  // چه باید بنویسد.
  await page.goto('/');
  await expect(page.getByLabel('نام کاربری')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByLabel('رمز عبور')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
