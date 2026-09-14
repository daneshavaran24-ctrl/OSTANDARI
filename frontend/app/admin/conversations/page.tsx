'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Summary = {
  id: number;
  roomName: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  messageCount: number;
};

type Message = { id: number; role: string; content: string; createdAt: string };

export default function ConversationsPage() {
  const [items, setItems] = useState<Summary[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/conversations')
      .then((r) => r.json())
      .then((d) => setItems(d.conversations ?? []))
      .catch(() => setStatus('خواندن تاریخچه ناموفق بود.'));
  }, []);

  async function open(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    const res = await fetch(`/api/admin/conversations?id=${id}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    setMessages(data?.messages ?? []);
    setOpenId(id);
  }

  async function remove(id: number) {
    const res = await fetch(`/api/admin/conversations?id=${id}`, { method: 'DELETE' }).catch(
      () => null
    );
    if (res?.ok) {
      setItems(items.filter((i) => i.id !== id));
      if (openId === id) setOpenId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">تاریخچه‌ی گفت‌وگوها</h1>

      <p className="text-fg2 text-sm">
        این رونوشت‌ها شامل گفته‌های واقعی کاربران است. مدت نگه‌داری در صفحه‌ی تنظیمات قابل تغییر
        است.
      </p>

      {items.length === 0 && <p className="text-fg2 text-sm">هنوز گفت‌وگویی ثبت نشده است.</p>}

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="border-separator1 rounded-md border">
            <div className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.startedAt}</p>
                <p className="text-fg2 text-sm">
                  {item.messageCount} پیام
                  {item.durationSeconds !== null && ` — ${item.durationSeconds} ثانیه`}
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => open(item.id)}>
                {openId === item.id ? 'بستن' : 'نمایش رونوشت'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => remove(item.id)}>
                حذف
              </Button>
            </div>

            {openId === item.id && (
              <div className="border-separator1 space-y-2 border-t p-3">
                {messages.length === 0 && <p className="text-fg2 text-sm">رونوشتی ثبت نشده.</p>}
                {messages.map((message) => (
                  <div key={message.id} className="text-sm">
                    <span className="text-fg2">
                      {message.role === 'user' ? 'کاربر' : 'دستیار'}:{' '}
                    </span>
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {status && (
        <p role="alert" className="text-fgSerious text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
