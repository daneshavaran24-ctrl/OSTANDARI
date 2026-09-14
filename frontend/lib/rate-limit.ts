/**
 * محدودیت نرخ ساده بر اساس پنجره‌ی زمانی، در حافظه.
 *
 * ⚠️ محدودیت مهم: این حالت در حافظه‌ی همان فرایند است. اگر برنامه را روی چند
 * نمونه یا روی یک محیط سرورلس با کولد-استارت اجرا کنید، هر نمونه شمارنده‌ی
 * خودش را دارد و سقف واقعی چند برابر می‌شود. برای استقرار جدی باید به یک
 * ذخیره‌ساز مشترک (Redis یا مشابه) منتقل شود. همین در SECURITY.md هم نوشته
 * شده تا کسی فکر نکند مسئله کامل حل شده است.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 10;

/** سقف درخواست در دقیقه، از RATE_LIMIT_PER_MINUTE. */
export function requestLimit(): number {
  const raw = process.env.RATE_LIMIT_PER_MINUTE?.trim();
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_LIMIT;
  return parsed;
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const limit = requestLimit();
  if (limit === 0) {
    return { allowed: false, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }

  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * کلید محدودیت را از هدرهای درخواست می‌سازد.
 *
 * از x-forwarded-for فقط اولین مقدار گرفته می‌شود؛ باقی زنجیره را کلاینت
 * می‌تواند جعل کند. اگر پشت پروکسی نیستید این هدر اصلاً قابل اعتماد نیست و
 * باید روی لایه‌ی بالاتر (nginx، Cloudflare) محدودیت بگذارید.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/** فقط برای تست. */
export function resetRateLimit(): void {
  buckets.clear();
}
