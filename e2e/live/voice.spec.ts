import { type Page, expect, test } from '@playwright/test';
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  APP,
  LIVE_DB,
  agentEnvironment,
  hasAvatarCredentials,
  hasVoiceCredentials,
  livekit,
  voiceCredentials,
} from './fixtures';

const run = promisify(execFile);
const AGENT_DIR = resolve(__dirname, '..', '..', 'agent');

type Participant = {
  identity: string;
  kind: string;
  tracks: { type: 'audio' | 'video'; muted: boolean }[];
};

/**
 * وضعیت اتاق از دید خود سرور.
 *
 * تکیه‌ی صرف به DOM اینجا کافی نیست: ممکن است ترکی منتشر شده باشد ولی هنوز
 * رندر نشده باشد، یا یک عنصر ویدیو وجود داشته باشد ولی چیزی پخش نکند.
 */
async function roomParticipants(): Promise<Participant[]> {
  const { stdout } = await run('uv', ['run', 'python', 'tests/live/room_state.py'], {
    cwd: AGENT_DIR,
    env: {
      ...process.env,
      LIVEKIT_URL: livekit.url,
      LIVEKIT_API_KEY: livekit.apiKey,
      LIVEKIT_API_SECRET: livekit.apiSecret,
    },
    timeout: 30_000,
  });

  const parsed = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as {
    rooms?: { participants: Participant[] }[];
  };
  return (parsed.rooms ?? []).flatMap((room) => room.participants);
}

/**
 * گفت‌وگوی صوتی واقعی: ایجنت زنده، مدل Realtime واقعی، آواتار واقعی.
 *
 * این تست کلید پولی مصرف می‌کند، پس بدون `OPENAI_API_KEY` خودش را رد می‌کند و
 * هرگز در اجرای معمولی اجرا نمی‌شود.
 *
 *   OPENAI_API_KEY=… BEY_API_KEY=… BEY_AVATAR_ID=… \
 *     npx playwright test -c playwright.live.config.ts --project=voice
 *
 * چیزهایی که فقط اینجا سنجیده می‌شوند و هیچ تست دیگری نمی‌گیرد:
 *
 *   * اعزام ایجنت واقعاً کار می‌کند (بدون آن، اتاق ساخته می‌شود و دستیار نمی‌آید)
 *   * ایجنت صدا منتشر می‌کند و آن صدا **واقعاً ساکت نیست**
 *   * آواتار Beyond Presence به‌عنوان یک شرکت‌کننده‌ی جدا ویدیو منتشر می‌کند
 *   * رونوشت گفت‌وگو در همان پایگاه داده‌ای می‌نشیند که پنل می‌خواند
 */

test.describe('گفت‌وگوی صوتی زنده', () => {
  test.skip(!hasVoiceCredentials, 'OPENAI_API_KEY تنظیم نشده است؛ این لایه کلید واقعی لازم دارد.');

  let agent: ChildProcess | null = null;

  test.beforeAll(async () => {
    agent = spawn('uv', ['run', 'python', 'src/agent.py', 'dev'], {
      cwd: AGENT_DIR,
      env: {
        ...agentEnvironment(),
        OPENAI_API_KEY: voiceCredentials.openai,
        BEY_API_KEY: voiceCredentials.beyKey,
        BEY_AVATAR_ID: voiceCredentials.beyAvatar,
        DATABASE_PATH: LIVE_DB,
        // مدت کوتاه تا تست معطل نماند؛ خودِ مهلت جای دیگری سنجیده می‌شود.
        SESSION_DURATION_SECONDS: '45',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const log: string[] = [];
    agent.stdout?.on('data', (chunk: Buffer) => log.push(chunk.toString()));
    agent.stderr?.on('data', (chunk: Buffer) => log.push(chunk.toString()));

    // کارگر باید به سرور ثبت شود، وگرنه هیچ کاری به آن اعزام نمی‌شود.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (log.join('').includes('registered worker')) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`کارگر ایجنت ثبت نشد:\n${log.join('').slice(-2000)}`);
  });

  test.afterAll(() => {
    agent?.kill('SIGINT');
  });

  /** نشست را شروع می‌کند و منتظر پیوستن ایجنت به اتاق می‌ماند. */
  async function startConversation(page: Page): Promise<void> {
    await page.goto(`${APP}/`);
    await page.getByRole('button', { name: 'شروع گفت‌وگو' }).click();
    await expect(page.getByRole('button', { name: 'Toggle microphone' })).toBeVisible({
      timeout: 45_000,
    });
  }

  test('ایجنت به اتاق می‌پیوندد و صدای واقعی می‌فرستد', async ({ page }) => {
    await startConversation(page);

    // اگر اعزام ایجنت کار نکند، همین‌جا شکست می‌خورد — و آن دقیقاً همان
    // خرابی خاموشی است که هیچ تست دیگری نمی‌گرفت.
    await expect
      .poll(async () => remoteParticipantCount(page), {
        timeout: 60_000,
        message: 'ایجنت به اتاق نپیوست',
      })
      .toBeGreaterThan(0);

    // صدا باید واقعاً انرژی داشته باشد. حضور ترک کافی نیست: یک ترک ساکت هم
    // «منتشرشده» است و تست را بی‌دلیل سبز می‌کند.
    const energy = await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const peers = (window as unknown as { __lkPeerConnections?: RTCPeerConnection[] })
        .__lkPeerConnections;
      const audio = Array.from(document.querySelectorAll('audio')).find((el) => el.srcObject);
      if (!audio?.srcObject)
        return { reason: 'no audio element', total: 0, peers: peers?.length ?? 0 };

      const context = new AudioContext();
      const source = context.createMediaStreamSource(audio.srcObject as MediaStream);
      const analyser = context.createAnalyser();
      source.connect(analyser);

      const samples = new Float32Array(analyser.fftSize);
      let total = 0;
      for (let i = 0; i < 40; i++) {
        analyser.getFloatTimeDomainData(samples);
        for (const value of samples) total += Math.abs(value);
        await wait(250);
      }
      await context.close();
      return { reason: 'measured', total, peers: peers?.length ?? 0 };
    });

    expect(energy.total, `صدای دریافتی ساکت بود (${energy.reason})`).toBeGreaterThan(0);
  });

  test('آواتار به‌عنوان شرکت‌کننده‌ی جدا ویدیو منتشر می‌کند', async ({ page }) => {
    test.skip(!hasAvatarCredentials, 'BEY_API_KEY یا BEY_AVATAR_ID تنظیم نشده است.');

    await startConversation(page);

    // آواتار Beyond Presence یک شرکت‌کننده‌ی مستقل است، نه ترک ایجنت.
    await expect
      .poll(
        async () =>
          (await roomParticipants()).some((p) => p.tracks.some((t) => t.type === 'video')),
        { timeout: 90_000, message: 'ویدیوی آواتار روی سرور ندیده شد' }
      )
      .toBe(true);

    // و واقعاً روی صفحه هم رندر شود، نه اینکه فقط منتشر شده باشد
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              Array.from(document.querySelectorAll('video')).filter(
                (v) => v.srcObject && v.videoWidth > 0
              ).length
          ),
        { timeout: 60_000, message: 'ویدیوی آواتار در مرورگر رندر نشد' }
      )
      .toBeGreaterThan(0);
  });

  test('رونوشت گفت‌وگو در همان پایگاه داده‌ی پنل می‌نشیند', async ({ page }) => {
    await startConversation(page);

    // نشست ۴۵ ثانیه‌ای است؛ ایجنت در پایانش رونوشت را یک‌جا می‌نویسد.
    await expect
      .poll(
        () => {
          const db = new DatabaseSync(LIVE_DB);
          try {
            const row = db.prepare('SELECT COUNT(*) AS n FROM conversations').get() as {
              n: number;
            };
            return row.n;
          } finally {
            db.close();
          }
        },
        { timeout: 120_000, message: 'ردیف گفت‌وگو ساخته نشد' }
      )
      .toBeGreaterThan(0);
  });
});
