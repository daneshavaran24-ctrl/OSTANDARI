'use client';

import { Button } from '@/components/ui/button';
import { useRpc } from './provider';
import type { NotificationKind } from './schemas';

/**
 * سطح نمایشی لایه‌ی RPC: اعلان‌ها، تأییدخواهی و درخواست دسترسی.
 *
 * از منطق ثبت متدها جداست تا بشود ظاهر را عوض کرد بدون دست زدن به قرارداد.
 */

const KIND_STYLES: Record<NotificationKind, string> = {
  success: 'border-green-600/40 bg-green-600/10 text-green-900 dark:text-green-100',
  error: 'border-red-600/40 bg-red-600/10 text-red-900 dark:text-red-100',
  warning: 'border-amber-600/40 bg-amber-600/10 text-amber-900 dark:text-amber-100',
  info: 'border-blue-600/40 bg-blue-600/10 text-blue-900 dark:text-blue-100',
};

const PERMISSION_TEXT = {
  camera: {
    title: 'اجازه‌ی دوربین',
    fallback: 'دستیار برای دیدن آنچه نشان می‌دهید به دوربین نیاز دارد.',
    confirm: 'روشن کردن دوربین',
  },
  screen_share: {
    title: 'اشتراک صفحه',
    fallback: 'دستیار برای راهنمایی، به دیدن صفحه‌ی شما نیاز دارد.',
    confirm: 'اشتراک صفحه',
  },
} as const;

export function RpcSurface() {
  const {
    notifications,
    confirmation,
    permission,
    dismissNotification,
    answerConfirmation,
    answerPermission,
  } = useRpc();

  return (
    <>
      {/* اعلان‌ها */}
      <div
        className="pointer-events-none fixed top-5 z-50 flex w-full max-w-sm flex-col gap-2 px-4 ltr:right-0 rtl:left-0"
        aria-live="polite"
      >
        {notifications.map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => dismissNotification(notification.id)}
            className={`pointer-events-auto rounded-md border p-3 text-start text-sm shadow-lg ${KIND_STYLES[notification.kind]}`}
          >
            {notification.message}
          </button>
        ))}
      </div>

      {/* تأییدخواهی — هیچ کار حساسی بدون آن انجام نمی‌شود */}
      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="rpc-confirm-title"
            className="border-separator1 bg-bg1 w-full max-w-sm space-y-4 rounded-lg border p-5 shadow-xl"
          >
            <h2 id="rpc-confirm-title" className="font-bold">
              {confirmation.title}
            </h2>
            <p className="text-fg2 text-sm leading-6">{confirmation.message}</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => answerConfirmation(true)} className="flex-1">
                {confirmation.confirmLabel}
              </Button>
              <Button
                variant="secondary"
                onClick={() => answerConfirmation(false)}
                className="flex-1"
              >
                {confirmation.cancelLabel}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* درخواست دسترسی — ایجنت فقط می‌تواند بخواهد، نه اینکه خودش روشن کند */}
      {permission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="rpc-permission-title"
            className="border-separator1 bg-bg1 w-full max-w-sm space-y-4 rounded-lg border p-5 shadow-xl"
          >
            <h2 id="rpc-permission-title" className="font-bold">
              {PERMISSION_TEXT[permission.kind].title}
            </h2>
            <p className="text-fg2 text-sm leading-6">
              {permission.reason || PERMISSION_TEXT[permission.kind].fallback}
            </p>
            <p className="text-fg2 text-xs leading-5">
              پس از تأیید، خود مرورگر هم یک بار اجازه می‌خواهد.
            </p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => answerPermission(true)} className="flex-1">
                {PERMISSION_TEXT[permission.kind].confirm}
              </Button>
              <Button
                variant="secondary"
                onClick={() => answerPermission(false)}
                className="flex-1"
              >
                نه، ممنون
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
