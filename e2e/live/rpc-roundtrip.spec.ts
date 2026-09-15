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
async function probe(scenario: string, timeout = 60_000): Promise<ProbeResult> {
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
  const args = ['run', 'python', 'tests/live/rpc_probe.py', '--scenario', scenario];

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

/** نشست را شروع می‌کند و منتظر می‌ماند تا مرورگر واقعاً به اتاق وصل شود. */
async function joinRoom(page: Page): Promise<void> {
  await page.goto(`${APP}/`);
  await page.getByRole('button', { name: 'شروع گفت‌وگو' }).click();

  // کلید میکروفون تنها پس از اتصال موفق و گرفتن مجوز انتشار رندر می‌شود، پس
  // انتظار روی آن یعنی انتظار روی یک اتصال WebRTC واقعی، نه یک تایمر دلبخواه.
  await expect(page.getByRole('button', { name: 'Toggle microphone' })).toBeVisible({
    timeout: 45_000,
  });
}

test.describe('رفت‌وبرگشت زنده‌ی RPC', () => {
  test('اعلان ایجنت روی صفحه‌ی کاربر دیده می‌شود و پاسخ برمی‌گردد', async ({ page }) => {
    await joinRoom(page);

    const result = await probe('notification');

    expect(result.ok, `کاوشگر شکست خورد: ${result.error}`).toBe(true);
    // پاسخ واقعی مرورگر، نه یک mock
    expect(result.result).toMatchObject({ ok: true });
    await expect(page.getByText('ایمیل با موفقیت ارسال شد.')).toBeVisible();
  });

  test('تأیید کاربر به ایجنت برمی‌گردد', async ({ page }) => {
    await joinRoom(page);

    // کاوشگر منتظر کلیک می‌ماند، پس نباید await شود
    const pending = probe('confirmation');

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toContainText('user@example.com');
    await dialog.getByRole('button', { name: 'تأیید' }).click();

    expect(await pending).toMatchObject({ ok: true, confirmed: true });
  });

  test('انصراف کاربر هم به ایجنت برمی‌گردد', async ({ page }) => {
    await joinRoom(page);

    const pending = probe('confirmation');

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
    await joinRoom(page);

    const started = Date.now();
    const pending = probe('confirmation', 170_000);
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
    await joinRoom(page);
    const result = await probe('avatar_state');
    expect(result).toMatchObject({ ok: true, result: { ok: true } });
  });

  test('payload نامعتبر را مرورگر رد می‌کند، نه اینکه نمایش دهد', async ({ page }) => {
    await joinRoom(page);

    // این payload عمداً اعتبارسنج پایتون را دور می‌زند تا سؤال واقعی پرسیده
    // شود: اگر داده‌ی خراب به مرورگر برسد، چه می‌شود؟
    const result = await probe('invalid_payload');

    expect(result.ok).toBe(true);
    expect(JSON.parse(result.raw ?? '{}')).toHaveProperty('error');
    // و هیچ اعلانی روی صفحه نیامده باشد
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('متد ثبت‌نشده روی سیم هم رد می‌شود', async ({ page }) => {
    await joinRoom(page);
    const result = await probe('unknown_method');
    expect(result).toMatchObject({ ok: true, rejected: true });
  });
});
