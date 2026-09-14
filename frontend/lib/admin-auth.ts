import { timingSafeEqual } from 'node:crypto';

/**
 * مقایسه‌ی رمز ورود ادمین.
 *
 * فقط در مسیر API ورود (رانتایم Node) استفاده می‌شود. توکن نشست در
 * `admin-token.ts` است چون میدل‌ور روی Edge اجرا می‌شود و node:crypto ندارد.
 *
 * این احراز هویت کاربر نیست — یک راز مشترک است. همه‌ی ادمین‌ها یک رمز دارند و
 * ردی از اینکه چه کسی چه تغییری داده نمی‌ماند. محدودیتش در SECURITY.md آمده.
 */

export function adminEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD?.trim());
}

/**
 * مقایسه‌ی زمان‌ثابت: یک `===` ساده روی اولین کاراکتر متفاوت متوقف می‌شود و
 * همان اختلاف زمانی حدس زدن رمز را ممکن می‌کند. برابری طول جداگانه بررسی
 * می‌شود تا افزودن بایت صفر کار نکند.
 */
export function passwordMatches(candidate: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;
  if (typeof candidate !== 'string' || candidate.length === 0) return false;

  const given = Buffer.from(candidate.normalize('NFC'), 'utf8');
  const wanted = Buffer.from(expected.normalize('NFC'), 'utf8');

  const length = Math.max(given.length, wanted.length);
  const pad = (buf: Buffer) => Buffer.concat([buf, Buffer.alloc(length - buf.length)]);

  return timingSafeEqual(pad(given), pad(wanted)) && given.length === wanted.length;
}
