import { describe, expect, it } from 'vitest';
import {
  AVATAR_STATES,
  MAX_MESSAGE_LENGTH,
  MAX_TITLE_LENGTH,
  NOTIFICATION_KINDS,
  RPC_METHODS,
  parseRpcPayload,
} from '@/rpc/schemas';

const ACTION = 'a'.repeat(32);

describe('قرارداد RPC', () => {
  it('فهرست مجاز دقیقاً همان متدهایی است که هندلر دارند', () => {
    // اگر متدی به قرارداد اضافه شود و هندلری نداشته باشد، ایجنت می‌تواند
    // چیزی را صدا بزند که هیچ کاری نمی‌کند.
    expect(RPC_METHODS).toEqual([
      'show_notification',
      'show_confirmation',
      'set_avatar_state',
      'request_camera_permission',
      'request_screen_share',
    ]);
  });
});

describe('اعتبارسنجی payload اعلان', () => {
  it('payload معتبر پذیرفته می‌شود', () => {
    const raw = JSON.stringify({ action_id: ACTION, kind: 'success', message: 'ایمیل ارسال شد.' });
    const result = parseRpcPayload('show_notification', raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toBe('ایمیل ارسال شد.');
  });

  it('هر چهار نوع اعلان پذیرفته می‌شوند', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const raw = JSON.stringify({ action_id: ACTION, kind, message: 'پیام' });
      expect(parseRpcPayload('show_notification', raw).ok).toBe(true);
    }
  });

  it('نوع ناشناخته رد می‌شود', () => {
    const raw = JSON.stringify({ action_id: ACTION, kind: 'delete_everything', message: 'x' });
    expect(parseRpcPayload('show_notification', raw).ok).toBe(false);
  });

  it('پیام خالی یا فقط فاصله رد می‌شود', () => {
    for (const message of ['', '   ', '\n']) {
      const raw = JSON.stringify({ action_id: ACTION, kind: 'info', message });
      expect(parseRpcPayload('show_notification', raw).ok).toBe(false);
    }
  });

  it('پیام بلندتر از سقف رد می‌شود', () => {
    // بدون سقف، ایجنت می‌تواند یک دیوار متن روی صفحه‌ی کاربر بیندازد
    const message = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);
    const raw = JSON.stringify({ action_id: ACTION, kind: 'info', message });
    expect(parseRpcPayload('show_notification', raw).ok).toBe(false);
  });

  it('بدون action_id رد می‌شود', () => {
    const raw = JSON.stringify({ kind: 'info', message: 'پیام' });
    expect(parseRpcPayload('show_notification', raw).ok).toBe(false);
  });

  it('JSON خراب به‌جای استثنا خطای تمیز می‌دهد', () => {
    // این از شبکه می‌آید؛ یک استثنای مدیریت‌نشده کل هندلر را می‌کشد.
    for (const raw of ['{بدون ساختار', '', 'null', '"رشته"', '42', '[]', 'true']) {
      expect(parseRpcPayload('show_notification', raw).ok).toBe(false);
    }
  });

  it('پیام خطا جزئیات داخلی را لو نمی‌دهد', () => {
    const result = parseRpcPayload('show_notification', '{}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toContain('zod');
      expect(result.reason.length).toBeLessThan(120);
    }
  });
});

describe('اعتبارسنجی تأییدخواهی', () => {
  const valid = { action_id: ACTION, title: 'ارسال ایمیل', message: 'فرستاده شود؟' };

  it('برچسب دکمه‌ها پیش‌فرض فارسی دارند', () => {
    const result = parseRpcPayload('show_confirmation', JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.confirm_label).toBe('تأیید');
      expect(result.data.cancel_label).toBe('انصراف');
    }
  });

  it('عنوان بلند رد می‌شود', () => {
    const raw = JSON.stringify({ ...valid, title: 'ع'.repeat(MAX_TITLE_LENGTH + 1) });
    expect(parseRpcPayload('show_confirmation', raw).ok).toBe(false);
  });

  it('بدون عنوان یا بدون متن رد می‌شود', () => {
    expect(parseRpcPayload('show_confirmation', JSON.stringify({ ...valid, title: '' })).ok).toBe(
      false
    );
    expect(parseRpcPayload('show_confirmation', JSON.stringify({ ...valid, message: '' })).ok).toBe(
      false
    );
  });
});

describe('اعتبارسنجی حالت آواتار', () => {
  it('همه‌ی حالت‌های تعریف‌شده پذیرفته می‌شوند', () => {
    for (const state of AVATAR_STATES) {
      const raw = JSON.stringify({ action_id: ACTION, state });
      expect(parseRpcPayload('set_avatar_state', raw).ok).toBe(true);
    }
  });

  it('حالت ناشناخته رد می‌شود', () => {
    const raw = JSON.stringify({ action_id: ACTION, state: 'dancing' });
    expect(parseRpcPayload('set_avatar_state', raw).ok).toBe(false);
  });
});

describe('اعتبارسنجی درخواست دسترسی', () => {
  it('بدون دلیل هم معتبر است', () => {
    expect(
      parseRpcPayload('request_camera_permission', JSON.stringify({ action_id: ACTION })).ok
    ).toBe(true);
  });

  it('دلیل بیش از حد بلند رد می‌شود', () => {
    const raw = JSON.stringify({ action_id: ACTION, reason: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) });
    expect(parseRpcPayload('request_screen_share', raw).ok).toBe(false);
  });
});
