import { NextResponse } from 'next/server';
import { adminEnabled, passwordMatches } from '@/lib/admin-auth';
import { ADMIN_COOKIE, cookieOptions, issueToken } from '@/lib/admin-token';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';

export const revalidate = 0;

export async function POST(request: Request) {
  // حدس زدن رمز باید محدود باشد؛ همان سازوکار توکن‌سرور استفاده می‌شود.
  const limit = checkRateLimit(`admin-login:${clientKey(request.headers)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'تلاش‌های بیش از حد. کمی بعد دوباره امتحان کنید.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  if (!adminEnabled()) {
    return NextResponse.json(
      { error: 'پنل ادمین پیکربندی نشده است (ADMIN_PASSWORD).' },
      { status: 503 }
    );
  }

  let password: unknown;
  try {
    password = ((await request.json()) as { password?: unknown })?.password;
  } catch {
    password = undefined;
  }

  if (!passwordMatches(password)) {
    return NextResponse.json({ error: 'رمز نادرست است.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, await issueToken(), cookieOptions());
  return response;
}

/** خروج از پنل. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return response;
}
