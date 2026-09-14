import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accessCodeMatches, accessCodeRequired } from '@/lib/access-code';
import { checkRateLimit, clientKey, requestLimit, resetRateLimit } from '@/lib/rate-limit';

describe('کد دسترسی', () => {
  const original = process.env.ACCESS_CODE;

  afterEach(() => {
    if (original === undefined) delete process.env.ACCESS_CODE;
    else process.env.ACCESS_CODE = original;
  });

  it('بدون ACCESS_CODE چیزی لازم نیست و همه‌چیز می‌گذرد', () => {
    delete process.env.ACCESS_CODE;
    expect(accessCodeRequired()).toBe(false);
    expect(accessCodeMatches(undefined)).toBe(true);
  });

  it('با ACCESS_CODE فقط کد درست قبول می‌شود', () => {
    process.env.ACCESS_CODE = 'ostandari-1404';
    expect(accessCodeRequired()).toBe(true);
    expect(accessCodeMatches('ostandari-1404')).toBe(true);
    expect(accessCodeMatches('wrong')).toBe(false);
  });

  it('پیشوند یا پسوند اضافه قبول نمی‌شود', () => {
    process.env.ACCESS_CODE = 'ostandari-1404';
    expect(accessCodeMatches('ostandari')).toBe(false);
    expect(accessCodeMatches('ostandari-1404x')).toBe(false);
  });

  it('بایت صفر در انتها نباید کد را قبول کند', () => {
    // این دقیقاً همان چیزی است که بررسی طول جلویش را می‌گیرد: هر دو طرف تا
    // طول بیشتر با صفر پر می‌شوند، پس بدون مقایسه‌ی طول، کدِ درست به‌اضافه‌ی
    // چند بایت صفر با کد اصلی یکسان درمی‌آید و می‌گذرد.
    process.env.ACCESS_CODE = 'ostandari-1404';
    expect(accessCodeMatches('ostandari-1404\u0000')).toBe(false);
    expect(accessCodeMatches('ostandari-1404\u0000\u0000')).toBe(false);
  });

  it('مقدارهای غیررشته‌ای رد می‌شوند', () => {
    process.env.ACCESS_CODE = 'secret';
    for (const value of [undefined, null, 42, {}, [], '']) {
      expect(accessCodeMatches(value)).toBe(false);
    }
  });

  it('فاصله‌ی اطراف کد سرور نادیده گرفته می‌شود', () => {
    process.env.ACCESS_CODE = '  secret  ';
    expect(accessCodeMatches('secret')).toBe(true);
  });
});

describe('محدودیت نرخ', () => {
  const original = process.env.RATE_LIMIT_PER_MINUTE;

  beforeEach(() => resetRateLimit());
  afterEach(() => {
    if (original === undefined) delete process.env.RATE_LIMIT_PER_MINUTE;
    else process.env.RATE_LIMIT_PER_MINUTE = original;
    resetRateLimit();
  });

  it('تا سقف اجازه می‌دهد و بعد رد می‌کند', () => {
    process.env.RATE_LIMIT_PER_MINUTE = '3';
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('ip-a', now).allowed).toBe(true);
    }
    const blocked = checkRateLimit('ip-a', now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('سقف هر کلاینت جداست', () => {
    process.env.RATE_LIMIT_PER_MINUTE = '1';
    const now = 1_000_000;
    expect(checkRateLimit('ip-a', now).allowed).toBe(true);
    expect(checkRateLimit('ip-a', now).allowed).toBe(false);
    // مسدود شدن یک کلاینت نباید بقیه را ببندد
    expect(checkRateLimit('ip-b', now).allowed).toBe(true);
  });

  it('بعد از پایان پنجره دوباره باز می‌شود', () => {
    process.env.RATE_LIMIT_PER_MINUTE = '1';
    const now = 1_000_000;
    expect(checkRateLimit('ip-a', now).allowed).toBe(true);
    expect(checkRateLimit('ip-a', now).allowed).toBe(false);
    expect(checkRateLimit('ip-a', now + 60_001).allowed).toBe(true);
  });

  it('سقف صفر همه‌چیز را می‌بندد', () => {
    process.env.RATE_LIMIT_PER_MINUTE = '0';
    expect(checkRateLimit('ip-a').allowed).toBe(false);
  });

  it('مقدار نامعتبر به پیش‌فرض برمی‌گردد، نه به بی‌نهایت', () => {
    // اگر اینجا NaN رد شود، مقایسه‌ی count >= NaN همیشه false است و محدودیت
    // عملاً غیرفعال می‌شود — یعنی یک تنظیم اشتباه، مهار را بی‌صدا برمی‌دارد.
    for (const bad of ['abc', '-5', '']) {
      process.env.RATE_LIMIT_PER_MINUTE = bad;
      expect(requestLimit()).toBe(10);
    }
  });
});

describe('تشخیص کلاینت', () => {
  it('اولین مقدار x-forwarded-for را می‌گیرد', () => {
    // باقی زنجیره را کلاینت می‌تواند جعل کند، پس فقط اولی قابل استفاده است.
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' });
    expect(clientKey(headers)).toBe('203.0.113.5');
  });

  it('در نبود forwarded سراغ x-real-ip می‌رود', () => {
    expect(clientKey(new Headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('بدون هیچ هدری یک کلید ثابت می‌دهد', () => {
    expect(clientKey(new Headers())).toBe('unknown');
  });
});
