import { describe, expect, it } from 'vitest';
import { extractUsername, isBlocked, parseBlockedUsers } from '@/lib/blocked-users';

describe('استخراج نام کاربری', () => {
  it('قالب کامل دامنه را می‌شکافد', () => {
    expect(extractUsername('\\vienna\\maxman123')).toBe('maxman123');
  });

  it('بدون بک‌اسلش ابتدایی هم کار می‌کند', () => {
    expect(extractUsername('vienna\\maxman123')).toBe('maxman123');
  });

  it('فقط نام کاربری را هم می‌پذیرد', () => {
    expect(extractUsername('maxman123')).toBe('maxman123');
  });

  it('حروف بزرگ و فاصله را نرمال می‌کند', () => {
    expect(extractUsername('  \\VIENNA\\MaxMan123  ')).toBe('maxman123');
  });

  it('ورودی خالی رشته‌ی خالی می‌دهد', () => {
    expect(extractUsername('')).toBe('');
    expect(extractUsername('   ')).toBe('');
  });
});

describe('تجزیه‌ی فهرست مسدودی', () => {
  it('خط‌های خالی را می‌اندازد', () => {
    expect(parseBlockedUsers('alice\n\nbob\n\n')).toEqual(['alice', 'bob']);
  });

  it('پایان خط ویندوزی را تحمل می‌کند', () => {
    // اسکریپت PowerShell بازنشانی دمو ممکن است CRLF بنویسد.
    expect(parseBlockedUsers('alice\r\nbob\r\n')).toEqual(['alice', 'bob']);
  });

  it('فایل خالی فهرست خالی می‌دهد', () => {
    expect(parseBlockedUsers('')).toEqual([]);
    expect(parseBlockedUsers('\n\n')).toEqual([]);
  });
});

describe('تشخیص مسدود بودن', () => {
  const list = 'alice\nmaxman123\nbob\n';

  it('کاربر مسدود را پیدا می‌کند', () => {
    expect(isBlocked('\\vienna\\maxman123', list)).toBe(true);
  });

  it('کاربر غیرمسدود را نمی‌گیرد', () => {
    expect(isBlocked('\\vienna\\someone', list)).toBe(false);
  });

  it('بعد از اینکه ایجنت او را حذف کرد، دیگر مسدود نیست', () => {
    // این همان حالتی است که بعد از فراخوانی unblock_user پیش می‌آید: فقط همان
    // کاربر از فهرست حذف می‌شود و بقیه می‌مانند.
    expect(isBlocked('\\vienna\\maxman123', 'alice\nbob\n')).toBe(false);
    expect(isBlocked('alice', 'alice\nbob\n')).toBe(true);
  });

  it('فایل خالی یعنی هیچ‌کس مسدود نیست', () => {
    expect(isBlocked('\\vienna\\maxman123', '')).toBe(false);
  });

  it('نام کاربری خالی هرگز مسدود نیست', () => {
    // بدون این بررسی، رشته‌ی خالی با یک خط خالی در فایل جور می‌شد.
    expect(isBlocked('', 'alice\n\nbob')).toBe(false);
  });
});
