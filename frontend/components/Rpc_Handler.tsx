'use client';

import { useEffect } from 'react';
import type { RpcInvocationData } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

/** اعلان‌هایی که ایجنت می‌تواند از طریق RPC روی صفحه‌ی کاربر نمایش دهد. */
type NotificationPayload =
  | { type: 'unblock_user'; username?: unknown }
  | { type: 'send_email'; email_address?: unknown };

const NOTIFICATION_COLORS = {
  unblock_user: '#10b981',
  send_email: '#3b82f6',
} as const;

/**
 * payload ورودی RPC را تجزیه و اعتبارسنجی می‌کند.
 *
 * export شده تا قابل تست باشد. این ورودی از شبکه می‌آید، پس هر شکل ناقص یا
 * نوع ناشناخته باید null بدهد نه اینکه به رندر برسد.
 */
export function parsePayload(raw: string): NotificationPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const type = (parsed as { type?: unknown }).type;
    if (type !== 'unblock_user' && type !== 'send_email') return null;
    return parsed as NotificationPayload;
  } catch {
    return null;
  }
}

function showToast(message: string, backgroundColor: string) {
  const popup = document.createElement('div');
  popup.textContent = message;
  popup.setAttribute('role', 'status');
  popup.style.cssText = `
    position: fixed;
    top: 20px;
    inset-inline-end: 20px;
    background: ${backgroundColor};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    max-width: 320px;
    animation: lkNotificationIn 0.3s ease-out;
  `;
  document.body.appendChild(popup);

  const removeTimer = window.setTimeout(() => {
    popup.style.animation = 'lkNotificationIn 0.3s ease-out reverse';
    window.setTimeout(() => popup.remove(), 300);
  }, 10_000);

  return () => {
    window.clearTimeout(removeTimer);
    popup.remove();
  };
}

export function RpcHandlers() {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;

    // انیمیشن از سمتی می‌آید که اعلان در آن سمت قرار دارد (RTL/LTR).
    const style = document.createElement('style');
    style.textContent = `
      @keyframes lkNotificationIn {
        from { transform: translateX(calc(100% * var(--lk-notification-dir, 1))); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      :root { --lk-notification-dir: 1; }
      [dir='rtl'] { --lk-notification-dir: -1; }
    `;
    document.head.appendChild(style);

    const cleanups = new Set<() => void>();

    const handleShowNotification = async (data: RpcInvocationData): Promise<string> => {
      const payload = parsePayload(data.payload);
      if (!payload) {
        return 'Error: Invalid or unknown notification payload';
      }

      let message: string;
      if (payload.type === 'unblock_user') {
        const username = payload.username;
        if (typeof username !== 'string' || username.trim() === '') {
          return 'Error: Invalid or missing username for unblock_user notification';
        }
        message = `مسدودیت کاربر ${username} برداشته شد.`;
      } else {
        const emailAddress = payload.email_address;
        if (typeof emailAddress !== 'string' || emailAddress.trim() === '') {
          return 'Error: Invalid or missing email_address for send_email notification';
        }
        message = `ایمیل با موفقیت به ${emailAddress} ارسال شد.`;
      }

      const dismiss = showToast(message, NOTIFICATION_COLORS[payload.type]);
      cleanups.add(dismiss);

      return 'Notification shown';
    };

    room.registerRpcMethod('client.showNotification', handleShowNotification);

    return () => {
      room.unregisterRpcMethod('client.showNotification');
      cleanups.forEach((dismiss) => dismiss());
      cleanups.clear();
      style.remove();
    };
  }, [room]);

  return null;
}
