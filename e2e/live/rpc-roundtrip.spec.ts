import { type Page, expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { APP, agentEnvironment } from './fixtures';

const run = promisify(execFile);
const AGENT_DIR = resolve(__dirname, '..', '..', 'agent');

/**
 * رفت‌وبرگشت واقعی RPC: ایجنت زنده ← سرور LiveKit واقعی ← مرورگر زنده.
 *
 * تا پیش از این، قرارداد RPC فقط با مقایسه‌ی دو فایل سنجیده می‌شد؛ یعنی
 * هم‌قدم بودن دو فهرست اثبات می‌شد ولی اینکه پیام واقعاً از سیم رد شود و پاسخ
 * برگردد، هرگز. این تست همان شکاف را می‌بندد.
 *
 * هیچ کلید پولی لازم نیست: سرور LiveKit محلی است و هیچ مدل زبانی در کار نیست.
 */

type ProbeResult = {
  ok: boolean;
  scenario?: string;
  result?: Record<string, unknown>;
  confirmed?: boolean;
  rejected?: boolean;
  raw?: string;
  error?: string;
};

/**
 * اسکریپت کاوش را اجرا می‌کند و تنها خط JSON خروجی‌اش را می‌خواند.
 *
 * همان `agent/src/rpc.py` تولید را صدا می‌زند، نه یک نسخه‌ی موازی — وگرنه
 * این تست چیزی را می‌سنجید که در تولید اجرا نمی‌شود.
 */
async function probe(scenario: string, room: string, timeout = 60_000): Promise<ProbeResult> {
  const options = {
    cwd: AGENT_DIR,
    // ⚠️ حتماً agentEnvironment و نه process.env خام: وقتی سرور LiveKit محلی
    // است، متغیرهای پروکسی باید پاک شوند. `livekit` مقدار HTTPS_PROXY را برای
    // همه‌ی اتصال‌ها به کار می‌برد و NO_PROXY را نادیده می‌گیرد، پس اتصال به
    // 127.0.0.1 هم از پروکسی رد می‌شود و شکست می‌خورد. همین تابع دقیقاً برای
    // این تله ساخته شده بود و اینجا استفاده نشده بود.
    env: agentEnvironment(),
    timeout,
  };
  // 🔴 نام اتاق صریح داده می‌شود، نه اینکه کاوشگر حدسش بزند.
  //
  // پیش از این، کاوشگر «تازه‌ترین اتاقی که کاربر دارد» را از API سرور پیدا
  // می‌کرد. ولی `creation_time` دقت **ثانیه** دارد و تست‌ها پشت سر هم اجرا
  // می‌شوند، پس اتاق تست قبلی و فعلی در یک ثانیه ساخته می‌شدند و انتخاب
  // دلبخواه می‌شد. نتیجه: کاوشگر به اتاق قبلی وصل می‌شد که کاربرش داشت
  // می‌رفت، و خطایش هم گمراه‌کننده بود — «کاربر پیش از پاسخ اتاق را ترک کرد».
  const args = ['run', 'python', 'tests/live/rpc_probe.py', '--scenario', scenario, '--room', room];

  // کاوشگر با خطا کد خروج غیرصفر می‌دهد، ولی همان‌جا هم یک خط JSON می‌نویسد.
  // بدون این، پیام واقعی گم می‌شد و تست فقط «Command failed» نشان می‌داد.
  let stdout: string;
  let stderr = '';
  try {
    ({ stdout } = await run('uv', args, options));
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    stdout = failure.stdout ?? '';
    stderr = failure.stderr ?? failure.message ?? '';
  }

  const line = stdout.trim().split('\n').at(-1) ?? '';
  if (!line) throw new Error(`کاوشگر خروجی نداد.\n${stderr}`);

  try {
    return JSON.parse(line) as ProbeResult;
  } catch {
    throw new Error(`خروجی کاوشگر JSON نبود: ${line}\n${stderr}`);
  }
}

/**
 * نشست را شروع می‌کند، منتظر اتصال واقعی می‌ماند، و **نام اتاق** را برمی‌گرداند.
 *
 * نام اتاق از پاسخ همان درخواستی خوانده می‌شود که خود اپ برای گرفتن توکن
 * می‌زند — یعنی دقیقاً همان اتاقی که مرورگر در آن است، بدون هیچ حدسی.
 */
async function joinRoom(page: Page): Promise<string> {
  await page.goto(`${APP}/`);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/connection-details')),
    page.getByRole('button', { name: 'شروع گفت‌وگو' }).click(),
  ]);
  const { roomName } = (await response.json()) as { roomName: string };

  // کلید میکروفون تنها پس از اتصال موفق و گرفتن مجوز انتشار رندر می‌شود، پس
  // انتظار روی آن یعنی انتظار روی یک اتصال WebRTC واقعی، نه یک تایمر دلبخواه.
  await expect(page.getByRole('button', { name: 'Toggle microphone' })).toBeVisible({
    timeout: 45_000,
  });

  return roomName;
}

test.describe('رفت‌وبرگشت زنده‌ی RPC', () => {
  test('اعلان ایجنت روی صفحه‌ی کاربر دیده می‌شود و پاسخ برمی‌گردد', async ({ page }) => {
    const room = await joinRoom(page);

    const result = await probe('notification', room);

    expect(result.ok, `کاوشگر شکست خورد: ${result.error}`).toBe(true);
    // پاسخ واقعی مرورگر، نه یک mock
    expect(result.result).toMatchObject({ ok: true });
    await expect(page.getByText('ایمیل با موفقیت ارسال شد.')).toBeVisible();
  });

  test('تأیید کاربر به ایجنت برمی‌گردد', async ({ page }) => {
    const room = await joinRoom(page);

    // کاوشگر منتظر کلیک می‌ماند، پس نباید await شود
    const pending = probe('confirmation', room);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toContainText('user@example.com');
    await dialog.getByRole('button', { name: 'تأیید' }).click();

    expect(await pending).toMatchObject({ ok: true, confirmed: true });
  });

  test('انصراف کاربر هم به ایجنت برمی‌گردد', async ({ page }) => {
    const room = await joinRoom(page);

    const pending = probe('confirmation', room);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'انصراف' }).click();

    expect(await pending).toMatchObject({ ok: true, confirmed: false });
    await expect(dialog).toBeHidden();
  });

  test('بستن صفحه در میانه‌ی تأییدخواهی «نه» شمرده می‌شود', async ({ page, context }) => {
    // مهلت بلندتر چون اینجا پاسخی نمی‌آید: ایجنت باید از قطع شدن شرکت‌کننده
    // بفهمد، و آن سیگنال از سمت سرور می‌رسد، نه از مرورگر.
    test.setTimeout(200_000);
    const room = await joinRoom(page);

    const started = Date.now();
    const pending = probe('confirmation', room, 170_000);
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 30_000 });

    // مهم‌ترین ادعای لایه‌ی RPC: سکوت هرگز رضایت نیست. اینجا واقعاً روی شبکه
    // آزموده می‌شود، نه با یک fake که خودش false برمی‌گرداند.
    await context.close();

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.confirmed).toBe(false);
    // عدد واقعی ثبت می‌شود تا اگر روزی کند شد، معلوم باشد
    console.log(
      `پاسخ «نه» پس از بسته شدن صفحه: ${Math.round((Date.now() - started) / 1000)} ثانیه`
    );
  });

  test('حالت آواتار از ایجنت به مرورگر می‌رسد', async ({ page }) => {
    const room = await joinRoom(page);
    const result = await probe('avatar_state', room);
    expect(result).toMatchObject({ ok: true, result: { ok: true } });
  });

  test('payload نامعتبر را مرورگر رد می‌کند، نه اینکه نمایش دهد', async ({ page }) => {
    const room = await joinRoom(page);

    // این payload عمداً اعتبارسنج پایتون را دور می‌زند تا سؤال واقعی پرسیده
    // شود: اگر داده‌ی خراب به مرورگر برسد، چه می‌شود؟
    const result = await probe('invalid_payload', room);

    expect(result.ok).toBe(true);
    expect(JSON.parse(result.raw ?? '{}')).toHaveProperty('error');
    // و هیچ اعلانی روی صفحه نیامده باشد
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('متد ثبت‌نشده روی سیم هم رد می‌شود', async ({ page }) => {
    const room = await joinRoom(page);
    const result = await probe('unknown_method', room);
    expect(result).toMatchObject({ ok: true, rejected: true });
  });
});
