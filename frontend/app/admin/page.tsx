'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const FIELDS = [
  { key: 'session_duration_seconds', label: 'مدت هر گفت‌وگو (ثانیه)', type: 'number' },
  { key: 'openai_realtime_model', label: 'مدل Realtime', type: 'text' },
  { key: 'openai_voice', label: 'صدای دستیار', type: 'text' },
  { key: 'bey_avatar_id', label: 'شناسه‌ی آواتار', type: 'text' },
  { key: 'noise_cancellation', label: 'نویزگیر', type: 'text' },
  { key: 'transcript_retention_days', label: 'نگه‌داری رونوشت (روز)', type: 'number' },
] as const;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => setSettings(d.settings ?? {}))
      .catch(() => setStatus('خواندن تنظیمات ناموفق بود.'));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);

    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => null);

    setBusy(false);
    const body = await res?.json().catch(() => null);
    setStatus(res?.ok ? 'تنظیمات ذخیره شد.' : (body?.error ?? 'ذخیره ناموفق بود.'));
  }

  const duration = Number(settings.session_duration_seconds ?? 30);

  return (
    <form onSubmit={save} className="space-y-6">
      <h1 className="text-xl font-bold">تنظیمات</h1>

      {duration > 0 && duration < 120 && (
        <p className="border-separatorModerate bg-bgModerate text-fgModerate rounded-md border p-3 text-sm">
          با مدت {duration} ثانیه، گردش‌کار کامل پشتیبانی (گرفتن ایمیل و ثبت تیکت) جا نمی‌شود و
          دستیار عمداً کوتاه پاسخ می‌دهد. برای استفاده‌ی واقعی مدت را بیشتر کنید.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label htmlFor={field.key} className="block text-sm">
              {field.label}
            </label>
            <input
              id={field.key}
              name={field.key}
              type={field.type}
              dir={field.type === 'number' ? 'ltr' : undefined}
              value={settings[field.key] ?? ''}
              onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
              className="border-separator1 bg-bg2 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.record_transcripts !== '0'}
          onChange={(e) =>
            setSettings({ ...settings, record_transcripts: e.target.checked ? '1' : '0' })
          }
        />
        ثبت رونوشت گفت‌وگوها
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'در حال ذخیره…' : 'ذخیره'}
        </Button>
        {status && (
          <span role="status" className="text-sm">
            {status}
          </span>
        )}
      </div>
    </form>
  );
}
