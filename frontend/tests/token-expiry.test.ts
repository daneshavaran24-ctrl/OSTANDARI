import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { isTokenExpired } from '@/hooks/useConnectionDetails';

const SECRET = new TextEncoder().encode('test-secret-test-secret-test-secret');

/** یک JWT واقعی با زمان انقضای مشخص می‌سازد. */
async function tokenExpiringAt(epochSeconds: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(epochSeconds)
    .sign(SECRET);
}

describe('تشخیص انقضای توکن', () => {
  const now = 1_800_000_000_000; // میلی‌ثانیه
  const nowSeconds = now / 1000;

  it('توکن تازه منقضی نیست', async () => {
    const token = await tokenExpiringAt(nowSeconds + 15 * 60);
    expect(isTokenExpired(token, now)).toBe(false);
  });

  it('توکن با دو دقیقه اعتبار هنوز منقضی نیست', async () => {
    const token = await tokenExpiringAt(nowSeconds + 120);
    expect(isTokenExpired(token, now)).toBe(false);
  });

  it('توکن با سی ثانیه اعتبار، منقضی حساب می‌شود', async () => {
    // یک دقیقه زودتر منقضی در نظر گرفته می‌شود تا توکن وسط اتصال باطل نشود.
    const token = await tokenExpiringAt(nowSeconds + 30);
    expect(isTokenExpired(token, now)).toBe(true);
  });

  it('توکنی که واقعاً گذشته، منقضی است', async () => {
    // این همان حالتی است که کد قبلی اشتباه می‌گرفت: exp برحسب ثانیه بود ولی
    // ۶۰۰۰۰ میلی‌ثانیه از آن کم می‌شد، پس نتیجه حوالی ۱۹۷۰ می‌افتاد و تابع
    // همیشه «منقضی نشده» برمی‌گرداند — یعنی اتصال بعد از ۱۵ دقیقه بی‌صدا
    // می‌مرد و هرگز تازه نمی‌شد.
    const token = await tokenExpiringAt(nowSeconds - 3600);
    expect(isTokenExpired(token, now)).toBe(true);
  });

  it('توکن نبود یا خراب بود، منقضی حساب می‌شود', async () => {
    expect(isTokenExpired(undefined, now)).toBe(true);
    expect(isTokenExpired('', now)).toBe(true);
    expect(isTokenExpired('not-a-jwt', now)).toBe(true);
    expect(isTokenExpired('a.b.c', now)).toBe(true);
  });

  it('توکن بدون exp منقضی حساب می‌شود', async () => {
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).sign(SECRET);
    expect(isTokenExpired(token, now)).toBe(true);
  });
});
