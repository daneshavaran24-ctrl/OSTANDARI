'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type SecretInfo = { name: string; last4: string; updatedAt: string };

const KEYS = [
  { name: 'openai_api_key', label: 'کلید OpenAI' },
  { name: 'bey_api_key', label: 'کلید Beyond Presence' },
] as const;

export default function KeysPage() {
  const [secrets, setSecrets] = useState<SecretInfo[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const load = () =>
    fetch('/api/admin/secrets')
      .then((r) => r.json())
      .then((d) => setSecrets(d.secrets ?? []))
      .catch(() => setStatus('خواندن کلیدها ناموفق بود.'));

  useEffect(() => {
    load();
  }, []);

  async function save(name: string) {
    const value = (values[name] ?? '').trim();
    if (!value) return;

    const res = await fetch('/api/admin/secrets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value }),
    }).catch(() => null);

    const body = await res?.json().catch(() => null);
    if (res?.ok) {
      setSecrets(body.secrets ?? []);
      setValues({ ...values, [name]: '' });
      setStatus('کلید ذخیره شد.');
    } else {
      setStatus(body?.error ?? 'ذخیره ناموفق بود.');
    }
  }

  async function remove(name: string) {
    const res = await fetch(`/api/admin/secrets?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok) {
      setSecrets(body.secrets ?? []);
      setStatus('کلید حذف شد؛ از این پس متغیر محیطی استفاده می‌شود.');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">کلیدهای API</h1>

      <p className="text-fg2 text-sm">
        کلیدها رمزنگاری‌شده ذخیره می‌شوند و هرگز دوباره نمایش داده نمی‌شوند. اگر کلیدی اینجا ذخیره
        نشود، همان مقدار موجود در فایل محیطی استفاده می‌شود.
      </p>

      {KEYS.map((key) => {
        const saved = secrets.find((s) => s.name === key.name);
        return (
          <div key={key.name} className="border-separator1 space-y-2 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={key.name} className="font-medium">
                {key.label}
              </label>
              {saved ? (
                <span className="text-fg2 text-xs" dir="ltr">
                  •••• {saved.last4} — {saved.updatedAt}
                </span>
              ) : (
                <span className="text-fg2 text-xs">ذخیره نشده (از محیط خوانده می‌شود)</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                id={key.name}
                type="password"
                dir="ltr"
                autoComplete="off"
                placeholder="کلید جدید را وارد کنید"
                value={values[key.name] ?? ''}
                onChange={(e) => setValues({ ...values, [key.name]: e.target.value })}
                className="border-separator1 bg-bg2 min-w-0 flex-1 rounded-md border px-3 py-2 text-left text-sm"
              />
              <Button type="button" variant="primary" onClick={() => save(key.name)}>
                ذخیره
              </Button>
              {saved && (
                <Button type="button" variant="secondary" onClick={() => remove(key.name)}>
                  حذف
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
