'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { safeNextPath } from '@/lib/admin-redirect';

export default function AdminLoginPage() {
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);

    setBusy(false);

    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? 'ورود ناموفق بود.');
      return;
    }

    // ناوبری کامل، نه router.replace: پیش‌واکشی‌های پیش از ورود ریدایرکت ۳۰۷
    // میدل‌ور را در کش روتر سمت کلاینت گذاشته‌اند و ناوبری نرم همان پاسخ کهنه را
    // مصرف می‌کند و کاربر را دوباره به همین صفحه برمی‌گرداند.
    window.location.assign(safeNextPath(params.get('next')));
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-xl font-bold">ورود به پنل مدیریت</h1>

        <label htmlFor="password" className="block text-sm">
          رمز عبور
        </label>
        <input
          id="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
          className="border-separator1 bg-bg2 w-full rounded-md border px-3 py-2 text-left"
        />

        <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
          {busy ? 'در حال بررسی…' : 'ورود'}
        </Button>

        {error && (
          <p role="alert" className="text-fgSerious text-center text-sm">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
