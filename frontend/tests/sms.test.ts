import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkGhasedakAccount } from '@/lib/sms';

/**
 * مهم‌ترین ادعای این فایل: **کد ۲۰۰ یعنی موفقیت نیست.**
 *
 * قاصدک برای کلید نامعتبر و اعتبار ناکافی هم ۲۰۰ برمی‌گرداند. اگر این را
 * باور کنیم، دکمه‌ی «آزمایش اتصال» به مدیر می‌گوید همه‌چیز درست است و اولین
 * خبر خرابی، شکست یک گفت‌وگوی واقعی خواهد بود.
 */

// کلید واقعی قاصدک ASCII است؛ کلید غیر ASCII سناریوی جداگانه‌ای دارد (پایین فایل)
const KEY = 'test-api-key-0123456789';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('آزمایش اتصال قاصدک', () => {
  const errors: unknown[][] = [];

  beforeEach(() => {
    errors.length = 0;
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('کلید خالی اصلاً به شبکه نمی‌رسد', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await checkGhasedakAccount('   ')).toEqual({ ok: false, reason: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('کلید را در سرتیتر ApiKey می‌فرستد و اعتبار را می‌خواند', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ isSuccess: true, data: { credit: 5000 } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: true, credit: 5000 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('GetAccountInformation');
    expect(init.headers.ApiKey).toBe(KEY);
    // آزمایش نباید هزینه بسازد: فقط خواندن
    expect(init.method).toBe('GET');
  });

  it('🔴 پاسخ ۲۰۰ با isSuccess=false ناموفق است', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ isSuccess: false, message: 'کلید نامعتبر است' }))
    );

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: false, reason: 'auth' });
  });

  it('پاسخ ۲۰۰ بدون isSuccess و بدون data هم ناموفق است', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: false, reason: 'auth' });
  });

  it('پاسخ بدون isSuccess ولی با data پذیرفته می‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { Credit: '120' } })));

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: true, credit: 120 });
  });

  it('موفقیت بدون عدد اعتبار هم موفقیت است', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ isSuccess: true, data: {} })));

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: true, credit: null });
  });

  it.each([401, 403])('کد %i یعنی مشکل کلید', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, status)));

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: false, reason: 'auth' });
  });

  it('خطای شبکه مهار می‌شود و پرتاب نمی‌کند', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: false, reason: 'network' });
  });

  it('پاسخ غیر JSON مهار می‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>خطا</html>')));

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: false, reason: 'service' });
  });

  it('پاسخ JSON ولی غیرشیء مهار می‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('ok')));

    expect(await checkGhasedakAccount(KEY)).toEqual({ ok: false, reason: 'service' });
  });

  it('🔴 متن خطای سرویس به بیرون درز نمی‌کند', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          isSuccess: false,
          message: 'حساب 55123 مسدود است؛ با پشتیبانی تماس بگیرید',
        })
      )
    );

    const result = await checkGhasedakAccount(KEY);

    // جزئیات حساب سرویس‌دهنده جای مرورگر نیست — فقط یک دلیل کلی برمی‌گردد
    expect(JSON.stringify(result)).not.toContain('55123');
    expect(Object.keys(result)).toEqual(['ok', 'reason']);
    // ولی باید در لاگ سرور مانده باشد، وگرنه عیب‌یابی ناممکن می‌شود
    expect(JSON.stringify(errors)).toContain('55123');
  });

  it('🔴 کلید در هیچ لاگی چاپ نمی‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`اتصال با ${KEY} قطع شد`)));

    await checkGhasedakAccount(KEY);

    // پیام خطای شبکه را خودمان نساخته‌ایم، ولی دست‌کم نباید کلید را خودمان اضافه کنیم
    expect(errors.length).toBe(1);
    expect(String(errors[0][0])).not.toContain(KEY);
  });
});

describe('کلید بدشکل', () => {
  /**
   * نگهبان خرابی‌ای که در اجرای دستی اسکریپت دیده شد: سرتیتر HTTP فقط ASCII
   * می‌پذیرد و `fetch` برای بقیه پرتاب می‌کند. بدون این بررسی، به مدیر «مشکل
   * شبکه» گزارش می‌شد و دنبال چیز اشتباهی می‌گشت.
   */
  it.each(['کلید-فارسی', 'key​with-zwsp', 'کلید ۱۲۳'])(
    'کلید «%s» اصلاً به شبکه نمی‌رسد',
    async (bad) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      expect(await checkGhasedakAccount(bad)).toEqual({ ok: false, reason: 'malformed' });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('کلید عادی ASCII رد نمی‌شود', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ isSuccess: true, data: { credit: 1 } }), { status: 200 })
        )
    );

    expect(await checkGhasedakAccount('a32aea96-1d21_5a65:750')).toEqual({ ok: true, credit: 1 });
  });
});
