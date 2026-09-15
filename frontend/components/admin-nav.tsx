'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * نوار پیمایش پنل مدیریت.
 *
 * روی صفحه‌ی ورود رندر نمی‌شود. دلیلش فقط زیبایی نیست: Next لینک‌ها را
 * پیش‌واکشی می‌کند و چون کاربرِ واردنشده از میدل‌ور ۳۰۷ می‌گیرد، آن ریدایرکت‌ها
 * در کش روتر می‌نشینند و بعد از ورود موفق، ناوبری سمت کلاینت همان پاسخ کهنه را
 * مصرف می‌کند و کاربر دوباره به صفحه‌ی ورود پرت می‌شود.
 */

const NAV = [
  { href: '/admin', label: 'تنظیمات' },
  { href: '/admin/keys', label: 'کلیدهای API' },
  { href: '/admin/restrictions', label: 'محدودیت‌ها' },
  { href: '/admin/sms', label: 'پیامک' },
  { href: '/admin/conversations', label: 'تاریخچه' },
];

export function AdminNav() {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  if (pathname === '/admin/login') return null;

  async function handleLogout() {
    setBusy(true);
    // خروج یعنی حذف کوکی؛ همان مسیر ورود با فعل DELETE این کار را می‌کند.
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => null);
    // ناوبری کامل، تا کش روتر سمت کلاینت هم با کوکی تازه دور ریخته شود.
    window.location.assign('/admin/login');
  }

  return (
    <header className="border-separator1 bg-bg2 border-b">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-3">
        <span className="text-foreground ms-1 me-4 font-bold">پنل مدیریت</span>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? 'page' : undefined}
            className="hover:bg-bg3 aria-[current=page]:bg-bg3 rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          className="text-fg2 hover:text-foreground ms-auto rounded-md px-3 py-1.5 text-sm"
        >
          خروج
        </button>
      </nav>
    </header>
  );
}
