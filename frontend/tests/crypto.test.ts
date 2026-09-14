import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, lastFour } from '@/lib/crypto';

const KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

describe('رمزنگاری کلیدهای API', () => {
  const saved = process.env.ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = saved;
  });

  it('بدون کلید خطای راهنما می‌دهد', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow(/openssl/);
  });

  it('کلید با طول اشتباه رد می‌شود', () => {
    process.env.ENCRYPTION_KEY = Buffer.from('کوتاه').toString('base64');
    expect(() => encryptSecret('x')).toThrow();
  });

  it.each(['sk-proj-abc', 'کلید فارسی', 'x'.repeat(5000)])('رفت‌وبرگشت: %s', (secret) => {
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('دو رمزنگاری از یک مقدار نباید یکسان باشد', () => {
    // iv تازه در هر بار، وگرنه از روی دیتابیس می‌شد فهمید دو کلید مثل هم‌اند
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('مقدار خالی رد می‌شود', () => {
    expect(() => encryptSecret('')).toThrow();
  });

  it('کلید اشتباه نمی‌تواند باز کند', () => {
    const blob = encryptSecret('راز');
    process.env.ENCRYPTION_KEY = Buffer.from('z'.repeat(32)).toString('base64');
    expect(() => decryptSecret(blob)).toThrow();
  });

  it('داده‌ی دستکاری‌شده رد می‌شود', () => {
    // GCM احراز اصالت دارد: تغییر یک بایت باید خطا بدهد نه متن آشغال
    const blob = Buffer.from(encryptSecret('راز'), 'base64');
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptSecret(blob.toString('base64'))).toThrow();
  });

  it('ورودی ناقص رد می‌شود', () => {
    expect(() => decryptSecret(Buffer.from('short').toString('base64'))).toThrow();
  });

  it('چهار کاراکتر آخر برای نمایش', () => {
    expect(lastFour('sk-proj-abcd1234')).toBe('1234');
    expect(lastFour('abc')).toBe('••••');
  });
});
