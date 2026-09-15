'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type SecretInfo = { name: string; last4: string; updatedAt: string };

const SECRET_NAME = 'sms_api_key';

export default function SmsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<SecretInfo[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => setSettings(d.settings ?? {}))
      .catch(() => setStatus('خواندن تنظیمات ناموفق بود.'));
    fetch('/api/admin/secrets')
      .then((r) => r.json())
      .then((d) => setSecrets(d.secrets ?? []))
      .catch(() => setStatus('خواندن کلیدها ناموفق بود.'));
  }, []);

  const saved = secrets.find((s) => s.name === SECRET_NAME);
  const enabled = settings.sms_enabled === '1';
  const lineNumber = (settings.sms_line_number ?? '').trim();
  const ready = Boolean(saved) && lineNumber !== '';

  async function putSettings(next: Record<string, string>) {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    return { ok: Boolean(res?.ok), error: body?.error as string | undefined };
  }

  async function toggle(checked: boolean) {
    // به‌روزرسانی خوش‌بینانه: چک‌باکسی که منتظر رفت‌وبرگشت شبکه بماند، در نگاه
    // کاربر (و در تست) خراب به نظر می‌رسد. اگر ذخیره نشد، برمی‌گردد.
    const previous = settings;
    const next = { ...settings, sms_enabled: checked ? '1' : '0' };
    setSettings(next);
    setStatus(null);

    const { ok, error } = await putSettings(next);
    if (!ok) {
      setSettings(previous);
      setStatus(error ?? 'ذخیره ناموفق بود.');
    }
  }

  async function saveLine(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    const { ok, error } = await putSettings(settings);
    setBusy(false);
    setStatus(ok ? 'تنظیمات ذخیره شد.' : (error ?? 'ذخیره ناموفق بود.'));
  }

  async function saveKey() {
    const value = apiKey.trim();
    if (!value) return;

    const res = await fetch('/api/admin/secrets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: SECRET_NAME, value }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);

    if (res?.ok) {
      setSecrets(body.secrets ?? []);
      setApiKey('');
      setStatus('کلید ذخیره شد.');
    } else {
      setStatus(body?.error ?? 'ذخیره‌ی کلید ناموفق بود.');
    }
  }

  async function removeKey() {
    const res = await fetch(`/api/admin/secrets?name=${SECRET_NAME}`, {
      method: 'DELETE',
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok) {
      setSecrets(body.secrets ?? []);
      setStatus('کلید حذف شد؛ از این پس متغیر محیطی استفاده می‌شود.');
    }
  }

  async function test() {
    setTesting(true);
    setStatus(null);

    const res = await fetch('/api/admin/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // کلید تایپ‌شده‌ی ذخیره‌نشده هم باید قابل آزمایش باشد
      body: JSON.stringify({ apiKey: apiKey.trim() }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);

    setTesting(false);
    if (body?.ok) {
      setStatus(
        body.credit === null
          ? 'اتصال برقرار است؛ کلید پذیرفته شد.'
          : `اتصال برقرار است. اعتبار حساب: ${body.credit}`
      );
    } else {
      setStatus(body?.error ?? 'آزمایش اتصال ناموفق بود.');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">پیامک</h1>

      <p className="text-fg2 text-sm">
        با روشن بودن این قابلیت، دستیار می‌تواند پیامک بفرستد — ولی هر ارسال، پیش از رفتن، روی صفحه
        به کاربر نشان داده می‌شود و بدون تأیید او انجام نمی‌شود.
      </p>

      {!ready && (
        <p className="border-separatorModerate bg-bgModerate text-fgModerate rounded-md border p-3 text-sm">
          تا وقتی کلید قاصدک و شماره‌ی خط هر دو تنظیم نشده‌اند، روشن کردن این قابلیت اثری ندارد و
          ابزار پیامک در اختیار دستیار قرار نمی‌گیرد.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
        ارسال پیامک فعال باشد
      </label>

      <form onSubmit={saveLine} className="border-separator1 space-y-2 rounded-md border p-4">
        <label htmlFor="sms_line_number" className="block font-medium">
          شماره‌ی خط
        </label>
        <p className="text-fg2 text-xs">
          همان خط فرستنده‌ای که در پنل قاصدک به حساب شما داده شده است. اگر خط اختصاصی ندارید، به‌جای
          شماره یکی از این سه کلیدواژه را بنویسید: <code dir="ltr">priority</code> (بر اساس اولویت
          خطوط پنل)، <code dir="ltr">fastest</code> (سریع‌ترین خط) یا{' '}
          <code dir="ltr">cheapest</code> (ارزان‌ترین خط).
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="sms_line_number"
            name="sms_line_number"
            dir="ltr"
            value={settings.sms_line_number ?? ''}
            onChange={(e) => setSettings({ ...settings, sms_line_number: e.target.value })}
            className="border-separator1 bg-bg2 min-w-0 flex-1 rounded-md border px-3 py-2 text-left text-sm"
          />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </div>
      </form>

      <div className="border-separator1 space-y-2 rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="sms_api_key" className="font-medium">
            کلید قاصدک
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
            id="sms_api_key"
            type="password"
            dir="ltr"
            autoComplete="off"
            placeholder="کلید جدید را وارد کنید"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="border-separator1 bg-bg2 min-w-0 flex-1 rounded-md border px-3 py-2 text-left text-sm"
          />
          <Button type="button" variant="primary" onClick={saveKey}>
            ذخیره
          </Button>
          {saved && (
            <Button type="button" variant="secondary" onClick={removeKey}>
              حذف
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={test} disabled={testing}>
            {testing ? 'در حال آزمایش…' : 'آزمایش اتصال'}
          </Button>
          <span className="text-fg2 text-xs">
            فقط اعتبار حساب را می‌خواند؛ پیامکی فرستاده نمی‌شود.
          </span>
        </div>
      </div>

      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
