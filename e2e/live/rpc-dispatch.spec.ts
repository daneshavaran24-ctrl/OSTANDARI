import { expect, test } from '@playwright/test';
import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { APP, LIVE_DB, agentEnvironment } from './fixtures';

const AGENT_DIR = resolve(__dirname, '..', '..', 'agent');

/**
 * ایجنت واقعاً به اتاق اعزام می‌شود.
 *
 * ایجنت با `agent_name` ثبت می‌شود و در LiveKit این یعنی **اعزام صریح**: هیچ
 * کاری خودکار به اتاق فرستاده نمی‌شود مگر توکن کاربر آن را بخواهد. اگر این
 * بخش از توکن بیفتد، هیچ خطایی رخ نمی‌دهد — مرورگر وصل می‌شود، اتاق ساخته
 * می‌شود، شمارش معکوس شروع می‌شود، و دستیار هرگز نمی‌آید.
 *
 * این تست همان خرابی خاموش را می‌گیرد و **هیچ کلید پولی لازم ندارد**: کلید
 * اوپن‌ای‌آی عمداً نامعتبر است. آنچه سنجیده می‌شود رسیدن کار به کارگر است، نه
 * گفت‌وگو. خطای اتصال به مدل پس از آن کاملاً مورد انتظار است.
 */

let agent: ChildProcess | null = null;
let log = '';

test.beforeAll(async () => {
  agent = spawn('uv', ['run', 'python', 'src/agent.py', 'dev'], {
    cwd: AGENT_DIR,
    env: {
      ...agentEnvironment(),
      // کلید نامعتبر عمدی: تا اینجا هزینه‌ای ایجاد نشود.
      OPENAI_API_KEY: 'sk-invalid-dispatch-check',
      DATABASE_PATH: LIVE_DB,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const collect = (chunk: Buffer) => {
    log += chunk.toString();
  };
  agent.stdout?.on('data', collect);
  agent.stderr?.on('data', collect);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (log.includes('registered worker')) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`کارگر ایجنت ثبت نشد:\n${log.slice(-2000)}`);
});

test.afterAll(() => {
  agent?.kill('SIGINT');
});

test('کار به کارگر ایجنت اعزام می‌شود', async ({ page }) => {
  expect(log, 'کارگر باید با همان نامی ثبت شود که توکن می‌خواهد').toContain('ostandari-support');

  // گرم کردن: اولین درخواست به سرور توسعه، مسیر را کامپایل می‌کند و چند ثانیه
  // پردازنده را اشغال می‌کند. اگر اعزام دقیقاً در همان لحظه انجام شود، سرور
  // کارگر را «پربار» می‌شمارد و کار را نمی‌فرستد.
  await page.goto(`${APP}/`);
  await page.waitForTimeout(1000);

  // هر نشست تازه یک اتاق تازه و یک تلاش تازه‌ی اعزام است. چند تلاش می‌کنیم تا
  // شلوغی گذرای ماشین با خرابی واقعی پیکربندی اشتباه گرفته نشود.
  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const before = log.length;

    await page.goto(`${APP}/`);
    await page.getByRole('button', { name: 'شروع گفت‌وگو' }).click();
    await expect(page.getByRole('button', { name: 'Toggle microphone' })).toBeVisible({
      timeout: 45_000,
    });

    // کارگر برای هر کار یک شناسه‌ی AJ_ می‌سازد. رسیدن آن یعنی اعزام کار کرده است.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (log.slice(before).includes('AJ_')) return;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw new Error(
    `پس از ${attempts} تلاش هیچ کاری به کارگر اعزام نشد — اعزام ایجنت در توکن از کار افتاده است.\n` +
      `آخرین خروجی کارگر:\n${log.slice(-2500)}`
  );
});
