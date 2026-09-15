/**
 * سنجش اتصال به قاصدک — فقط برای دکمه‌ی «آزمایش اتصال» در پنل.
 *
 * ارسال واقعی پیامک کار ایجنت است (`agent/src/sms.py`) و اینجا عمداً پیاده
 * نشده: دو مسیر ارسال یعنی دو جای ممکن برای اشتباه، و تضمین «یک‌بار-ارسال»
 * به جدول `sms_events` گره خورده که ایجنت می‌نویسد.
 *
 * ⚠️ همان درسی که در پایتون گرفتیم اینجا هم برقرار است: **کد ۲۰۰ یعنی موفقیت
 * نیست.** قاصدک برای خطاهای منطقی — کلید نامعتبر، اعتبار ناکافی — هم ۲۰۰
 * برمی‌گرداند و وضعیت واقعی داخل بدنه است.
 */

/** از سورس SDK رسمی قاصدک، نسخه‌ی ۱.۰.۳ */
const BASE_URL = 'https://gateway.ghasedak.me/Rest/api/v1/WebService/';

const TIMEOUT_MS = 20_000;

export type AccountCheck =
  | { ok: true; credit: number | null }
  | { ok: false; reason: 'network' | 'auth' | 'service' | 'malformed' };

function credit(payload: Record<string, unknown>): number | null {
  const data = (payload.data ?? payload.Data) as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return null;

  for (const key of ['credit', 'Credit', 'balance', 'Balance']) {
    const value = data[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function succeeded(payload: Record<string, unknown>): boolean {
  for (const key of ['isSuccess', 'IsSuccess']) {
    if (key in payload) return Boolean(payload[key]);
  }
  // بدون فیلد صریح، وجود بخش data نشانه‌ی موفقیت این اندپوینت است
  const data = payload.data ?? payload.Data;
  return typeof data === 'object' && data !== null;
}

/**
 * اعتبار حساب را می‌خواند تا معلوم شود کلید کار می‌کند.
 *
 * پیامکی نمی‌فرستد و اعتباری خرج نمی‌کند.
 *
 * 🔴 هرگز متن خطای سرویس را برنمی‌گرداند، فقط یک دلیل کلی. پاسخ این تابع به
 * مرورگر می‌رسد و پیام‌های سرویس‌دهنده می‌توانند شامل شناسه‌ی حساب و جزئیات
 * پیکربندی باشند. جزئیات در لاگ سرور می‌ماند.
 */
export async function checkGhasedakAccount(apiKey: string): Promise<AccountCheck> {
  if (!apiKey.trim()) return { ok: false, reason: 'auth' };

  // سرتیتر HTTP فقط ASCII می‌پذیرد. بدون این بررسی، کلیدی که از یک پنل فارسی
  // کپی شده (یا یک فاصله‌ی نامرئی دارد) باعث پرتاب fetch می‌شود و به مدیر
  // «مشکل شبکه» گزارش می‌دهیم — یعنی دقیقاً دنبال چیز اشتباهی می‌گردد.
  // ایجنت هم همین بررسی را دارد: agent/src/sms.py::_headers
  if (!/^[\x20-\x7e]+$/.test(apiKey)) return { ok: false, reason: 'malformed' };

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}GetAccountInformation`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'cache-control': 'no-cache', ApiKey: apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error('اتصال به قاصدک ممکن نشد:', error);
    return { ok: false, reason: 'network' };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'auth' };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    console.error('پاسخ قاصدک JSON نبود:', response.status);
    return { ok: false, reason: 'service' };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'service' };
  }

  const body = payload as Record<string, unknown>;

  if (response.status >= 400 || !succeeded(body)) {
    // متن خطا فقط اینجا می‌ماند، نه در پاسخ
    console.error('قاصدک درخواست را نپذیرفت:', response.status, JSON.stringify(body).slice(0, 200));
    return { ok: false, reason: response.status >= 400 ? 'service' : 'auth' };
  }

  return { ok: true, credit: credit(body) };
}
