import { timingSafeEqual } from 'node:crypto';

/** آیا سرور کد دسترسی می‌خواهد؟ */
export function accessCodeRequired(): boolean {
  return Boolean(process.env.ACCESS_CODE?.trim());
}

/**
 * کد ارسالی را با کد تنظیم‌شده روی سرور مقایسه می‌کند.
 *
 * مقایسه با timingSafeEqual انجام می‌شود تا مدت پاسخ چیزی از کد لو ندهد؛ یک
 * مقایسه‌ی ساده‌ی `===` روی اولین کاراکتر متفاوت متوقف می‌شود و همین اختلاف
 * زمانی، حدس زدن کد را ممکن می‌کند.
 *
 * چون timingSafeEqual روی طول‌های نابرابر استثنا می‌دهد، هر دو مقدار تا طول
 * یکسان پر می‌شوند و برابری طول جداگانه بررسی می‌شود.
 */
export function accessCodeMatches(candidate: unknown): boolean {
  const expected = process.env.ACCESS_CODE?.trim();
  if (!expected) return true; // کدی تنظیم نشده، پس چیزی برای بررسی نیست
  if (typeof candidate !== 'string' || candidate.length === 0) return false;

  const given = Buffer.from(candidate.normalize('NFC'), 'utf8');
  const wanted = Buffer.from(expected.normalize('NFC'), 'utf8');

  const length = Math.max(given.length, wanted.length);
  const pad = (buf: Buffer) => Buffer.concat([buf, Buffer.alloc(length - buf.length)]);

  return timingSafeEqual(pad(given), pad(wanted)) && given.length === wanted.length;
}
