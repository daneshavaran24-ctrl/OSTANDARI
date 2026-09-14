'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Restriction = {
  id: number;
  topic: string;
  response: string;
  enabled: boolean;
  position: number;
};

export default function RestrictionsPage() {
  const [items, setItems] = useState<Restriction[]>([]);
  const [topic, setTopic] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/restrictions')
      .then((r) => r.json())
      .then((d) => setItems(d.restrictions ?? []))
      .catch(() => setStatus('خواندن محدودیت‌ها ناموفق بود.'));
  }, []);

  async function send(method: string, body?: unknown, query = '') {
    const res = await fetch(`/api/admin/restrictions${query}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);

    const data = await res?.json().catch(() => null);
    if (res?.ok) {
      setItems(data.restrictions ?? []);
      setStatus(null);
    } else {
      setStatus(data?.error ?? 'عملیات ناموفق بود.');
    }
    return Boolean(res?.ok);
  }

  /**
   * فعال/غیرفعال کردن، با به‌روزرسانی خوش‌بینانه.
   *
   * چک‌باکس کنترل‌شده است، پس اگر منتظر پاسخ سرور بمانیم کاربر کلیک می‌کند و
   * تیک چند دهم ثانیه سرِ جای قبلی می‌ماند — انگار کلیک گم شده. پس فوری
   * عوض می‌شود و اگر درخواست شکست خورد، به حالت قبل برمی‌گردد.
   */
  async function toggle(item: Restriction, enabled: boolean) {
    const previous = items;
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, enabled } : row)));
    if (!(await send('PATCH', { id: item.id, enabled }))) {
      setItems(previous);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (await send('POST', { topic: topic.trim(), response: response.trim() })) {
      setTopic('');
      setResponse('');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">محدودیت‌های موضوعی</h1>

      <p className="text-fg2 text-sm">
        دستیار در این موضوع‌ها وارد بحث نمی‌شود و همان پاسخ تعیین‌شده را می‌گوید. توجه داشته باشید
        که این راهنمایی به مدل است، نه یک فیلتر قطعی.
      </p>

      <form onSubmit={add} className="border-separator1 space-y-3 rounded-md border p-4">
        <h2 className="font-medium">افزودن محدودیت</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="topic" className="block text-sm">
              موضوع
            </label>
            <input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="مثلاً مسائل سیاسی"
              className="border-separator1 bg-bg2 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="response" className="block text-sm">
              پاسخ دستیار
            </label>
            <input
              id="response"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="مثلاً در این باره نمی‌توانم صحبت کنم."
              className="border-separator1 bg-bg2 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <Button type="submit" variant="primary" disabled={!topic.trim() || !response.trim()}>
          افزودن
        </Button>
      </form>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="border-separator1 flex flex-wrap items-center gap-3 rounded-md border p-3"
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.enabled}
                aria-label={`فعال بودن ${item.topic}`}
                onChange={(e) => toggle(item, e.target.checked)}
              />
              فعال
            </label>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.topic}</p>
              <p className="text-fg2 text-sm">{item.response}</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => send('DELETE', undefined, `?id=${item.id}`)}
            >
              حذف
            </Button>
          </li>
        ))}
        {items.length === 0 && <li className="text-fg2 text-sm">هنوز محدودیتی تعریف نشده است.</li>}
      </ul>

      {status && (
        <p role="alert" className="text-fgSerious text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
