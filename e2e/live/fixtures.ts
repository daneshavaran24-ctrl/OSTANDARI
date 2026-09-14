import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * ثابت‌های آزمون زنده. بدون اثر جانبی — همان درسی که در `e2e/fixtures.ts` گرفته شد.
 */

export const LIVE_DIR = join(tmpdir(), 'ostandari-live');
export const LIVE_DB = join(LIVE_DIR, 'live.db');
export const LIVE_KEY = Buffer.from('live-test-key-live-test-key-live').toString('base64');

/** پورت‌ها عمداً با تست‌های معمولی فرق دارند تا دو اجرا به هم نخورند. */
export const APP_PORT = 3400;
export const APP = `http://localhost:${APP_PORT}`;
export const LIVEKIT_PORT = Number(process.env.LIVEKIT_DEV_PORT ?? 7880);

/**
 * اگر LIVEKIT_URL از بیرون داده شود (مثلاً LiveKit Cloud)، سرور محلی بالا
 * نمی‌آید و همان استفاده می‌شود.
 */
export const usingExternalLiveKit = Boolean(process.env.LIVEKIT_URL);

export const livekit = {
  url: process.env.LIVEKIT_URL ?? `ws://127.0.0.1:${LIVEKIT_PORT}`,
  apiKey: process.env.LIVEKIT_API_KEY ?? 'devkey',
  apiSecret: process.env.LIVEKIT_API_SECRET ?? 'secret',
};

/** آزمون صوتی فقط با کلید واقعی معنی دارد. */
export const voiceCredentials = {
  openai: process.env.OPENAI_API_KEY ?? '',
  beyKey: process.env.BEY_API_KEY ?? '',
  beyAvatar: process.env.BEY_AVATAR_ID ?? '',
};

export const hasVoiceCredentials = Boolean(voiceCredentials.openai);
export const hasAvatarCredentials = Boolean(voiceCredentials.beyKey && voiceCredentials.beyAvatar);

/**
 * محیطی که فرایند ایجنت با آن اجرا می‌شود.
 *
 * ⚠️ پروکسی عمداً پاک می‌شود وقتی سرور LiveKit محلی است. `livekit-agents`
 * مقدار HTTPS_PROXY را برای **همه‌ی** اتصال‌ها به کار می‌برد و NO_PROXY را
 * نادیده می‌گیرد، پس وب‌سوکت کارگر به `127.0.0.1` هم از پروکسی رد می‌شود و با
 * ۴۰۵ شکست می‌خورد. همین در محیط‌های سازمانی با LiveKit داخلی هم رخ می‌دهد.
 */
export function agentEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };

  if (!usingExternalLiveKit) {
    delete environment.HTTP_PROXY;
    delete environment.HTTPS_PROXY;
    delete environment.http_proxy;
    delete environment.https_proxy;
  }

  return {
    ...environment,
    LIVEKIT_URL: livekit.url,
    LIVEKIT_API_KEY: livekit.apiKey,
    LIVEKIT_API_SECRET: livekit.apiSecret,
  };
}
