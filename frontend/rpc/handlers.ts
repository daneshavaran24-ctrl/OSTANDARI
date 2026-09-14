import {
  type AvatarState,
  type RpcMethod,
  type ShowConfirmation,
  parseRpcPayload,
} from './schemas';

/**
 * منطق هندلرهای RPC، جدا از React.
 *
 * هرچه اینجاست تصمیم‌گیری است: تجزیه، اعتبارسنجی، و شکل پاسخی که به ایجنت
 * برمی‌گردد. اثرهای بیرونی (تغییر state، باز کردن دیالوگ، روشن کردن دوربین) از
 * بیرون تزریق می‌شوند.
 *
 * دلیل این جدایی آزمون‌پذیری است: این منطق را می‌شود بدون رندر، بدون اتاق
 * LiveKit و بدون مرورگر سنجید — همان کاری که برای `remainingAt` هم شد.
 */

export type PermissionKind = 'camera' | 'screen_share';

export type RpcEffects = {
  /** اعلان را نشان می‌دهد و خودش مسئول پاک کردنش است. */
  showNotification: (notification: {
    id: string;
    kind: 'success' | 'error' | 'warning' | 'info';
    message: string;
  }) => void;
  setAvatarState: (state: AvatarState) => void;
  /** تا کلیک کاربر منتظر می‌ماند. */
  askConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
  /** اجازه می‌گیرد و در صورت تأیید، دستگاه را روشن می‌کند. */
  askPermission: (kind: PermissionKind, id: string, reason?: string) => Promise<boolean>;
};

export type ConfirmationRequest = {
  id: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
};

export type RpcHandlers = Record<RpcMethod, (rawPayload: string) => Promise<string>>;

function refuse(reason: string): string {
  return JSON.stringify({ error: reason });
}

export function createRpcHandlers(effects: RpcEffects): RpcHandlers {
  return {
    show_notification: async (raw) => {
      const parsed = parseRpcPayload('show_notification', raw);
      if (!parsed.ok) return refuse(parsed.reason);

      const { action_id, kind, message } = parsed.data;
      effects.showNotification({ id: action_id, kind, message });
      return JSON.stringify({ ok: true, action_id });
    },

    show_confirmation: async (raw) => {
      const parsed = parseRpcPayload('show_confirmation', raw);
      if (!parsed.ok) return refuse(parsed.reason);

      const data: ShowConfirmation = parsed.data;
      const confirmed = await effects.askConfirmation({
        id: data.action_id,
        title: data.title,
        message: data.message,
        confirmLabel: data.confirm_label,
        cancelLabel: data.cancel_label,
      });

      return JSON.stringify({ confirmed, action_id: data.action_id });
    },

    set_avatar_state: async (raw) => {
      const parsed = parseRpcPayload('set_avatar_state', raw);
      if (!parsed.ok) return refuse(parsed.reason);

      effects.setAvatarState(parsed.data.state);
      return JSON.stringify({ ok: true, action_id: parsed.data.action_id });
    },

    request_camera_permission: async (raw) => {
      const parsed = parseRpcPayload('request_camera_permission', raw);
      if (!parsed.ok) return refuse(parsed.reason);

      const granted = await effects.askPermission(
        'camera',
        parsed.data.action_id,
        parsed.data.reason
      );
      return JSON.stringify({ granted, action_id: parsed.data.action_id });
    },

    request_screen_share: async (raw) => {
      const parsed = parseRpcPayload('request_screen_share', raw);
      if (!parsed.ok) return refuse(parsed.reason);

      const granted = await effects.askPermission(
        'screen_share',
        parsed.data.action_id,
        parsed.data.reason
      );
      return JSON.stringify({ granted, action_id: parsed.data.action_id });
    },
  };
}
