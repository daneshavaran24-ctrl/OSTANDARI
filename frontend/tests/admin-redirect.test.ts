import { describe, expect, it } from 'vitest';
import { ADMIN_HOME, safeNextPath } from '@/lib/admin-redirect';

describe('مقصد بازگشت بعد از ورود', () => {
  it('مسیرهای داخلی پنل را نگه می‌دارد', () => {
    expect(safeNextPath('/admin')).toBe('/admin');
    expect(safeNextPath('/admin/keys')).toBe('/admin/keys');
    expect(safeNextPath('/admin/conversations')).toBe('/admin/conversations');
  });

  it('نشانی بیرونی را رد می‌کند', () => {
    // ریدایرکت باز: کاربر بعد از ورود سر از سایت مهاجم درمی‌آورد
    expect(safeNextPath('https://phishing.example/admin')).toBe(ADMIN_HOME);
    expect(safeNextPath('http://localhost:9/admin')).toBe(ADMIN_HOME);
  });

  it('نشانی بدون پروتکل را هم رد می‌کند', () => {
    // //evil.example را مرورگر نشانی مطلق می‌خواند، نه مسیر داخلی
    expect(safeNextPath('//evil.example')).toBe(ADMIN_HOME);
    expect(safeNextPath('//evil.example/admin')).toBe(ADMIN_HOME);
    expect(safeNextPath('/\\evil.example')).toBe(ADMIN_HOME);
  });

  it('مسیرهای بیرون از پنل را رد می‌کند', () => {
    expect(safeNextPath('/')).toBe(ADMIN_HOME);
    expect(safeNextPath('/api/admin/secrets')).toBe(ADMIN_HOME);
    // پیشوند مشترک نباید کافی باشد
    expect(safeNextPath('/administrator')).toBe(ADMIN_HOME);
    expect(safeNextPath('/admin.evil.example')).toBe(ADMIN_HOME);
  });

  it('به صفحه‌ی ورود برنمی‌گردد', () => {
    expect(safeNextPath('/admin/login')).toBe(ADMIN_HOME);
  });

  it('مقدار نبود یا غیررشته‌ای را به خانه می‌برد', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(safeNextPath(value)).toBe(ADMIN_HOME);
    }
  });
});
