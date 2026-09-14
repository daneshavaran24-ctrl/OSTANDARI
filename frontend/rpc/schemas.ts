import { z } from 'zod';

/**
 * قرارداد RPC میان ایجنت و مرورگر.
 *
 * این فایل **تنها فهرست مجاز** سمت مرورگر است. هر متدی که اینجا نباشد ثبت
 * نمی‌شود، پس فراخوانی‌اش از سمت ایجنت با خطای «متد پشتیبانی نمی‌شود» برمی‌گردد.
 *
 * ⚠️ این فهرست باید با `agent/src/rpc.py` هم‌قدم بماند. نام متدها، مقادیر مجاز
 * و سقف طول رشته‌ها در هر دو طرف یکی‌اند؛ تست‌ها این هم‌قدمی را می‌سنجند.
 * دلیل دوباره‌کاری این نیست که به سمت مقابل اعتماد نداریم — payload از شبکه
 * می‌آید و شبکه هرگز قابل اعتماد نیست.
 */

export const MAX_MESSAGE_LENGTH = 300;
export const MAX_TITLE_LENGTH = 120;

export const NOTIFICATION_KINDS = ['success', 'error', 'warning', 'info'] as const;
export const AVATAR_STATES = [
  'idle',
  'connecting',
  'listening',
  'thinking',
  'speaking',
  'error',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type AvatarState = (typeof AVATAR_STATES)[number];

/** هر فراخوانی یک شناسه دارد تا در `rpc_events` قابل ردیابی باشد. */
const actionId = z.string().min(1).max(64);

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

export const showNotificationSchema = z.object({
  action_id: actionId,
  kind: z.enum(NOTIFICATION_KINDS),
  message: nonEmpty(MAX_MESSAGE_LENGTH),
});

export const showConfirmationSchema = z.object({
  action_id: actionId,
  title: nonEmpty(MAX_TITLE_LENGTH),
  message: nonEmpty(MAX_MESSAGE_LENGTH),
  confirm_label: z.string().trim().min(1).max(40).default('تأیید'),
  cancel_label: z.string().trim().min(1).max(40).default('انصراف'),
});

export const setAvatarStateSchema = z.object({
  action_id: actionId,
  state: z.enum(AVATAR_STATES),
});

export const permissionRequestSchema = z.object({
  action_id: actionId,
  reason: z.string().trim().max(MAX_MESSAGE_LENGTH).optional(),
});

export const RPC_SCHEMAS = {
  show_notification: showNotificationSchema,
  show_confirmation: showConfirmationSchema,
  set_avatar_state: setAvatarStateSchema,
  request_camera_permission: permissionRequestSchema,
  request_screen_share: permissionRequestSchema,
} as const;

export type RpcMethod = keyof typeof RPC_SCHEMAS;

export const RPC_METHODS = Object.keys(RPC_SCHEMAS) as RpcMethod[];

export type ShowNotification = z.infer<typeof showNotificationSchema>;
export type ShowConfirmation = z.infer<typeof showConfirmationSchema>;
export type SetAvatarState = z.infer<typeof setAvatarStateSchema>;
export type PermissionRequest = z.infer<typeof permissionRequestSchema>;

export type RpcPayload<M extends RpcMethod> = z.infer<(typeof RPC_SCHEMAS)[M]>;

/**
 * payload خام را تجزیه و اعتبارسنجی می‌کند.
 *
 * پیام خطا عمداً جزئیات zod را برنمی‌گرداند؛ آن جزئیات به لاگ می‌رود. آنچه به
 * ایجنت برمی‌گردد باید کوتاه و بی‌ضرر باشد.
 */
export function parseRpcPayload<M extends RpcMethod>(
  method: M,
  raw: string
): { ok: true; data: RpcPayload<M> } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'payload is not valid JSON' };
  }

  const result = RPC_SCHEMAS[method].safeParse(json);
  if (!result.success) {
    return { ok: false, reason: `payload does not match the ${method} schema` };
  }

  return { ok: true, data: result.data as RpcPayload<M> };
}
