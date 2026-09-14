import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type RpcEffects, createRpcHandlers } from '@/rpc/handlers';
import { RPC_METHODS } from '@/rpc/schemas';

const ACTION = 'b'.repeat(32);

function makeEffects(overrides: Partial<RpcEffects> = {}) {
  const shown: unknown[] = [];
  const states: string[] = [];
  const asked: unknown[] = [];

  const effects: RpcEffects = {
    showNotification: (n) => shown.push(n),
    setAvatarState: (s) => states.push(s),
    askConfirmation: async (request) => {
      asked.push(request);
      return true;
    },
    askPermission: async (kind, id, reason) => {
      asked.push({ kind, id, reason });
      return true;
    },
    ...overrides,
  };

  return { effects, shown, states, asked, handlers: createRpcHandlers(effects) };
}

describe('هندلرهای RPC', () => {
  it('برای هر متد مجاز یک هندلر وجود دارد', () => {
    const { handlers } = makeEffects();
    // اگر متدی به قرارداد اضافه شود و هندلرش ساخته نشود، ثبتش روی اتاق
    // با undefined انجام می‌شود و فراخوانی ایجنت بی‌صدا شکست می‌خورد.
    for (const method of RPC_METHODS) {
      expect(typeof handlers[method]).toBe('function');
    }
  });
});

describe('show_notification', () => {
  it('اعلان را نشان می‌دهد و تأیید برمی‌گرداند', async () => {
    const { handlers, shown } = makeEffects();
    const raw = JSON.stringify({ action_id: ACTION, kind: 'success', message: 'ایمیل ارسال شد.' });

    const response = JSON.parse(await handlers.show_notification(raw));

    expect(shown).toEqual([{ id: ACTION, kind: 'success', message: 'ایمیل ارسال شد.' }]);
    expect(response).toEqual({ ok: true, action_id: ACTION });
  });

  it('payload نامعتبر هیچ اعلانی نشان نمی‌دهد', async () => {
    const { handlers, shown } = makeEffects();
    const raw = JSON.stringify({ action_id: ACTION, kind: 'explode', message: 'x' });

    const response = JSON.parse(await handlers.show_notification(raw));

    expect(shown).toEqual([]);
    expect(response.error).toBeTruthy();
    expect(response.ok).toBeUndefined();
  });

  it('JSON خراب استثنا پرتاب نمی‌کند', async () => {
    const { handlers } = makeEffects();
    // اگر اینجا استثنا برود، LiveKit هندلر را مرده می‌کند و بقیه‌ی اعلان‌های
    // همان نشست هم دیگر نمی‌رسند.
    const response = JSON.parse(await handlers.show_notification('{خراب'));
    expect(response.error).toBeTruthy();
  });
});

describe('show_confirmation', () => {
  const valid = JSON.stringify({
    action_id: ACTION,
    title: 'ارسال ایمیل',
    message: 'به user@example.com فرستاده شود؟',
  });

  it('پاسخ کاربر را عیناً برمی‌گرداند', async () => {
    const yes = makeEffects({ askConfirmation: async () => true });
    expect(JSON.parse(await yes.handlers.show_confirmation(valid))).toEqual({
      confirmed: true,
      action_id: ACTION,
    });

    const no = makeEffects({ askConfirmation: async () => false });
    expect(JSON.parse(await no.handlers.show_confirmation(valid))).toEqual({
      confirmed: false,
      action_id: ACTION,
    });
  });

  it('برچسب پیش‌فرض دکمه‌ها به دیالوگ می‌رسد', async () => {
    const { handlers, asked } = makeEffects();
    await handlers.show_confirmation(valid);
    expect(asked[0]).toMatchObject({ confirmLabel: 'تأیید', cancelLabel: 'انصراف' });
  });

  it('payload نامعتبر هیچ دیالوگی باز نمی‌کند', async () => {
    const { handlers, asked } = makeEffects();
    const raw = JSON.stringify({ action_id: ACTION, title: '', message: 'x' });

    const response = JSON.parse(await handlers.show_confirmation(raw));

    expect(asked).toEqual([]);
    expect(response.error).toBeTruthy();
    // مهم: نبود confirmed نباید جایی مثل «تأیید شد» خوانده شود
    expect(response.confirmed).toBeUndefined();
  });
});

describe('set_avatar_state', () => {
  it('حالت معتبر اعمال می‌شود', async () => {
    const { handlers, states } = makeEffects();
    await handlers.set_avatar_state(JSON.stringify({ action_id: ACTION, state: 'thinking' }));
    expect(states).toEqual(['thinking']);
  });

  it('حالت ناشناخته اعمال نمی‌شود', async () => {
    const { handlers, states } = makeEffects();
    await handlers.set_avatar_state(JSON.stringify({ action_id: ACTION, state: 'dancing' }));
    expect(states).toEqual([]);
  });
});

describe('درخواست دسترسی', () => {
  it('دوربین و اشتراک صفحه به نوع درست می‌روند', async () => {
    const { handlers, asked } = makeEffects();

    await handlers.request_camera_permission(JSON.stringify({ action_id: ACTION }));
    await handlers.request_screen_share(
      JSON.stringify({ action_id: ACTION, reason: 'برای راهنمایی' })
    );

    expect(asked).toEqual([
      { kind: 'camera', id: ACTION, reason: undefined },
      { kind: 'screen_share', id: ACTION, reason: 'برای راهنمایی' },
    ]);
  });

  it('رد کاربر به granted: false می‌رسد', async () => {
    const { handlers } = makeEffects({ askPermission: async () => false });
    const response = JSON.parse(
      await handlers.request_camera_permission(JSON.stringify({ action_id: ACTION }))
    );
    expect(response).toEqual({ granted: false, action_id: ACTION });
  });

  it('payload نامعتبر اصلاً از کاربر نمی‌پرسد', async () => {
    const ask = vi.fn();
    const { handlers } = makeEffects({ askPermission: ask });
    const raw = JSON.stringify({ action_id: ACTION, reason: 'x'.repeat(1000) });

    const response = JSON.parse(await handlers.request_camera_permission(raw));

    expect(ask).not.toHaveBeenCalled();
    expect(response.granted).toBeUndefined();
  });
});
