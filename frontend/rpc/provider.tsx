'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RpcInvocationData } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';
import { type ConfirmationRequest, type PermissionKind, createRpcHandlers } from './handlers';
import { type AvatarState, type NotificationKind, RPC_METHODS } from './schemas';

/**
 * ثبت یک‌جای همه‌ی متدهای RPC روی اتاق.
 *
 * چرا یک نقطه؟ چون پراکنده کردن `registerRpcMethod` در کامپوننت‌ها یعنی هیچ‌کس
 * نمی‌داند ایجنت در مجموع چه کارهایی می‌تواند روی صفحه‌ی کاربر انجام دهد — و
 * همان لحظه‌ای که این را ندانیم، فهرست مجاز بی‌معنی می‌شود.
 *
 * تصمیم‌گیری هندلرها در `handlers.ts` است؛ اینجا فقط سیم‌کشی React و اتاق.
 */

export type Notification = {
  id: string;
  kind: NotificationKind;
  message: string;
};

type PendingConfirmation = ConfirmationRequest & { resolve: (confirmed: boolean) => void };

type PendingPermission = {
  id: string;
  kind: PermissionKind;
  reason?: string;
  resolve: (granted: boolean) => void;
};

type RpcState = {
  avatarState: AvatarState;
  notifications: Notification[];
  confirmation: PendingConfirmation | null;
  permission: PendingPermission | null;
  dismissNotification: (id: string) => void;
  answerConfirmation: (confirmed: boolean) => void;
  answerPermission: (granted: boolean) => void;
};

const RpcContext = createContext<RpcState | null>(null);

export function useRpc(): RpcState {
  const value = useContext(RpcContext);
  if (!value) throw new Error('useRpc باید داخل <RpcProvider> استفاده شود.');
  return value;
}

const NOTIFICATION_TTL_MS = 10_000;

export function RpcProvider({ children }: { children: React.ReactNode }) {
  const room = useRoomContext();

  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [permission, setPermission] = useState<PendingPermission | null>(null);

  // هندلرهای RPC به آخرین مقدار نیاز دارند، بدون اینکه ثبت متدها با هر رندر
  // دوباره انجام شود.
  const confirmationRef = useRef<PendingConfirmation | null>(null);
  const permissionRef = useRef<PendingPermission | null>(null);
  confirmationRef.current = confirmation;
  permissionRef.current = permission;

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((n) => n.id !== id));
  }, []);

  const answerConfirmation = useCallback((confirmed: boolean) => {
    const pending = confirmationRef.current;
    setConfirmation(null);
    pending?.resolve(confirmed);
  }, []);

  const answerPermission = useCallback((granted: boolean) => {
    const pending = permissionRef.current;
    setPermission(null);
    pending?.resolve(granted);
  }, []);

  useEffect(() => {
    if (!room) return;

    const timers = new Set<number>();

    const handlers = createRpcHandlers({
      setAvatarState,

      showNotification: (notification) => {
        setNotifications((current) => [...current, notification]);
        const timer = window.setTimeout(() => {
          dismissNotification(notification.id);
          timers.delete(timer);
        }, NOTIFICATION_TTL_MS);
        timers.add(timer);
      },

      askConfirmation: (request) => {
        // اگر تأییدخواهی قبلی باز مانده، بسته و «نه» شمرده می‌شود. دو دیالوگ
        // هم‌زمان یعنی کاربر نمی‌داند دارد به کدام پاسخ می‌دهد.
        confirmationRef.current?.resolve(false);
        return new Promise<boolean>((resolve) => {
          setConfirmation({ ...request, resolve });
        });
      },

      /**
       * درخواست دسترسی همیشه از کاربر پرسیده می‌شود.
       *
       * ایجنت حق ندارد دوربین یا اشتراک صفحه را خودش روشن کند؛ فقط می‌تواند
       * بخواهد. روشن کردن واقعی پس از کلیک کاربر انجام می‌شود، چون مرورگر هم
       * برای getUserMedia و getDisplayMedia یک تعامل کاربر لازم دارد.
       */
      askPermission: async (kind, id, reason) => {
        permissionRef.current?.resolve(false);

        const accepted = await new Promise<boolean>((resolve) => {
          setPermission({ id, kind, reason, resolve });
        });

        if (!accepted) return false;

        try {
          if (kind === 'camera') await room.localParticipant.setCameraEnabled(true);
          else await room.localParticipant.setScreenShareEnabled(true);
          return true;
        } catch {
          // کاربر در پنجره‌ی خود مرورگر رد کرده، یا دستگاهی وجود ندارد.
          return false;
        }
      },
    });

    for (const method of RPC_METHODS) {
      room.registerRpcMethod(method, (data: RpcInvocationData) => handlers[method](data.payload));
    }

    return () => {
      for (const method of RPC_METHODS) room.unregisterRpcMethod(method);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      // هر چیزی که باز مانده «نه» است — بسته شدن صفحه رضایت نیست.
      confirmationRef.current?.resolve(false);
      permissionRef.current?.resolve(false);
    };
  }, [room, dismissNotification]);

  const value = useMemo(
    () => ({
      avatarState,
      notifications,
      confirmation,
      permission,
      dismissNotification,
      answerConfirmation,
      answerPermission,
    }),
    [
      avatarState,
      notifications,
      confirmation,
      permission,
      dismissNotification,
      answerConfirmation,
      answerPermission,
    ]
  );

  return <RpcContext.Provider value={value}>{children}</RpcContext.Provider>;
}
