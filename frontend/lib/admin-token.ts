/**
 * توکن نشست ادمین — سازگار با رانتایم Edge.
 *
 * میدل‌ور روی Edge اجرا می‌شود و `node:crypto` ندارد، پس اینجا از Web Crypto
 * استفاده می‌شود که هم در Edge و هم در Node موجود است. مقایسه‌ی رمز ورود که
 * فقط در مسیر API (رانتایم Node) لازم است در `admin-auth.ts` مانده.
 */

export const ADMIN_COOKIE = 'ostandari_admin';

/** مدت اعتبار نشست ادمین: هشت ساعت. */
export const SESSION_SECONDS = 8 * 60 * 60;

function keyMaterial(): Uint8Array {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('ENCRYPTION_KEY تنظیم نشده است.');
  return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyMaterial() as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(),
    new TextEncoder().encode(payload)
  );
  return toBase64Url(signature);
}

/** مقایسه‌ی زمان‌ثابت، تا مدت پاسخ چیزی از امضا لو ندهد. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** مقدار کوکی: «زمان انقضا.امضا» */
export async function issueToken(now: number = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${expiresAt}.${await sign(String(expiresAt))}`;
}

export async function tokenIsValid(token: unknown, now: number = Date.now()): Promise<boolean> {
  if (typeof token !== 'string') return false;

  const separator = token.indexOf('.');
  if (separator <= 0) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiry = Number.parseInt(expiresAt, 10);
  if (!Number.isFinite(expiry) || expiry * 1000 <= now) return false;

  // امضا روی خودِ زمان انقضاست، پس جلو بردن آن بدون کلید، امضا را باطل می‌کند.
  try {
    return equal(signature, await sign(expiresAt));
  } catch {
    return false;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  };
}
