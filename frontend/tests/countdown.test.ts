import { describe, expect, it } from 'vitest';
import { formatRemaining, remainingAt } from '@/hooks/useSessionCountdown';

describe('قالب‌بندی زمان باقی‌مانده', () => {
  it.each([
    [30, '0:30'],
    [9, '0:09'],
    [60, '1:00'],
    [75, '1:15'],
    [600, '10:00'],
    [0, '0:00'],
  ])('%s ثانیه → %s', (input, expected) => {
    expect(formatRemaining(input)).toBe(expected);
  });

  it('مقدار منفی صفر نشان داده می‌شود', () => {
    // بدون این، وقتی تب در پس‌زمینه بوده و شمارش عقب افتاده، عدد منفی
    // نمایش داده می‌شد.
    expect(formatRemaining(-5)).toBe('0:00');
  });

  it('کسر ثانیه رو به پایین گرد می‌شود', () => {
    expect(formatRemaining(29.9)).toBe('0:29');
  });
});

describe('محاسبه‌ی زمان باقی‌مانده', () => {
  const START = 1_700_000_000_000;

  it('در لحظه‌ی شروع، تمام مدت باقی است', () => {
    expect(remainingAt(30, START, START)).toBe(30);
  });

  it('با گذشت زمان کم می‌شود', () => {
    expect(remainingAt(30, START, START + 1_000)).toBe(29);
    expect(remainingAt(30, START, START + 29_500)).toBe(1);
  });

  it('در پایان مدت صفر می‌شود و منفی نمی‌رود', () => {
    expect(remainingAt(30, START, START + 30_000)).toBe(0);
    // تبِ پس‌زمینه: مرورگر تایمر را کند می‌کند و تیک خیلی دیر می‌رسد
    expect(remainingAt(30, START, START + 10 * 60_000)).toBe(0);
  });

  it('بر اساس ساعت واقعی است، نه تعداد تیک‌ها', () => {
    // اگر پیاده‌سازی تیک می‌شمرد، پرشِ زمانی نادیده گرفته می‌شد و کاربر با
    // کوچک کردن پنجره وقت اضافه می‌گرفت.
    expect(remainingAt(120, START, START + 90_000)).toBe(30);
  });

  it('مدت نامعتبر یعنی بدون وقت', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(remainingAt(bad, START, START)).toBe(0);
    }
  });
});
