/**
 * اعتبارسنجی مقصد بازگشت بعد از ورود.
 *
 * پارامتر `next` از نشانی می‌آید، یعنی کاملاً در اختیار مهاجم است. اگر همان‌طور
 * که هست به مرورگر داده شود، یک ریدایرکت باز می‌سازد: لینکی به
 * `/admin/login?next=https://phishing.example` که کاربر بعد از ورود به سایت
 * مهاجم می‌رود. پس فقط مسیرهای داخلی خودِ پنل پذیرفته می‌شوند.
 *
 * `//evil.example` هم پذیرفته نمی‌شود؛ مرورگر آن را نشانی مطلق با همان
 * پروتکل می‌خواند، نه مسیر داخلی.
 */
const ALLOWED = /^\/admin(?:\/[A-Za-z0-9\-_/]*)?$/;

export const ADMIN_HOME = '/admin';

export function safeNextPath(raw: unknown): string {
  if (typeof raw !== 'string') return ADMIN_HOME;
  const value = raw.trim();
  if (!ALLOWED.test(value)) return ADMIN_HOME;
  // صفحه‌ی ورود مقصد معنی‌داری نیست و حلقه می‌سازد.
  if (value === '/admin/login') return ADMIN_HOME;
  return value;
}
